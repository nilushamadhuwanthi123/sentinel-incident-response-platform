import { describe, expect, it } from 'vitest';
import {
  CORRELATION_RULES,
  DEFAULT_WINDOW_MS,
  correlateEvents,
} from '../correlationEngine.js';

const T0 = Date.parse('2026-09-13T09:41:00.000Z');
const at = (offsetMs) => new Date(T0 + offsetMs).toISOString();

const failedLogins = (count, overrides = {}) =>
  Array.from({ length: count }, (_, i) => ({
    id: `fail-${i}`,
    type: 'FAILED_LOGIN',
    at: at(i * 4000),
    sourceIp: '203.0.113.9',
    userId: 'svc-admin',
    service: 'auth',
    knownSource: false,
    privileged: true,
    ...overrides,
  }));

const credentialAttack = () => [
  ...failedLogins(27),
  {
    id: 'unknown-ip',
    type: 'UNKNOWN_IP',
    at: at(120000),
    sourceIp: '203.0.113.9',
    knownSource: false,
    service: 'edge-gateway',
  },
  {
    id: 'escalation',
    type: 'PRIVILEGE_ESCALATION',
    at: at(240000),
    sourceIp: '203.0.113.9',
    userId: 'svc-admin',
    privileged: true,
    service: 'auth',
  },
  {
    id: 'sensitive',
    type: 'SENSITIVE_API_ACCESS',
    at: at(360000),
    sourceIp: '203.0.113.9',
    userId: 'svc-admin',
    privileged: true,
    sensitive: true,
    resource: '/api/v1/records',
    service: 'core-api',
  },
];

describe('the hero case', () => {
  it('correlates a credential attack into one classified candidate', () => {
    const { candidates } = correlateEvents(credentialAttack());
    expect(candidates).toHaveLength(1);

    const c = candidates[0];
    expect(c.pattern).toBe('CREDENTIAL_ATTACK');
    expect(c.label).toBe('Possible credential attack');
    expect(c.classified).toBe(true);
    expect(c.counts.total).toBe(30);
    expect(c.counts.failedLogins).toBe(27);
    expect(c.confidence).toBeGreaterThanOrEqual(70);
  });

  it('returns the reasoning as structured data the UI can render', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    const ruleIds = c.reasoning.map((r) => r.rule);

    expect(ruleIds).toEqual(expect.arrayContaining([
      'AUTH_FAILURE_BURST',
      'EXTERNAL_ORIGIN',
      'PRIVILEGED_IDENTITY',
      'SENSITIVE_RESOURCE',
    ]));

    c.reasoning.forEach((r) => {
      expect(r.label).toEqual(expect.any(String));
      expect(r.detail).toEqual(expect.any(String));
      expect(r.eventIds.length).toBeGreaterThan(0);
    });
  });

  it('orders the reasoning by how much each rule contributed', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    for (let i = 1; i < c.reasoning.length; i += 1) {
      expect(c.reasoning[i - 1].weight).toBeGreaterThanOrEqual(
        c.reasoning[i].weight
      );
    }
  });

  it('emits risk signals the risk engine can consume directly', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    const burst = c.riskSignals.find((s) => s?.id === 'REPEATED_AUTH_FAILURE');

    expect(burst).toEqual({ id: 'REPEATED_AUTH_FAILURE', count: 27 });
    expect(c.riskSignals).toEqual(
      expect.arrayContaining([
        'UNKNOWN_EXTERNAL_IP',
        'PRIVILEGED_ACCOUNT',
        'SENSITIVE_RESOURCE_ACCESS',
      ])
    );
  });

  it('reports the entities and the time window the activity spanned', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    expect(c.entities.sourceIps).toEqual(['203.0.113.9']);
    expect(c.entities.users).toEqual(['svc-admin']);
    expect(c.entities.services.length).toBeGreaterThan(1);
    expect(c.window.spanMs).toBeGreaterThan(0);
  });
});

describe('grouping', () => {
  it('groups events that share a source address', () => {
    const { candidates } = correlateEvents(failedLogins(8));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].counts.total).toBe(8);
  });

  it('bridges events transitively through a shared entity', () => {
    // A and B share an IP; B and C share a session; nothing links A to C
    // directly. All three must still land in one cluster.
    const { candidates } = correlateEvents([
      { id: 'a', type: 'FAILED_LOGIN', at: at(0), sourceIp: '10.0.0.5' },
      {
        id: 'b',
        type: 'FAILED_LOGIN',
        at: at(1000),
        sourceIp: '10.0.0.5',
        sessionId: 'sess-1',
      },
      { id: 'c', type: 'SENSITIVE_API_ACCESS', at: at(2000), sessionId: 'sess-1' },
    ], { minConfidence: 0 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].eventIds).toEqual(
      expect.arrayContaining(['a', 'b', 'c'])
    );
  });

  it('does not correlate unrelated events', () => {
    const { candidates } = correlateEvents([
      { id: 'x', type: 'FAILED_LOGIN', at: at(0), sourceIp: '10.0.0.1', userId: 'alice' },
      { id: 'y', type: 'API_LATENCY', at: at(1000), sourceIp: '10.0.0.2', userId: 'bob' },
      { id: 'z', type: 'DATABASE_ERROR', at: at(2000), sourceIp: '10.0.0.3', userId: 'carol' },
    ], { minConfidence: 0 });

    expect(candidates).toHaveLength(0); // each cluster has one event
  });

  it('separates events that share an entity but fall outside the window', () => {
    const far = DEFAULT_WINDOW_MS * 3;
    const { candidates } = correlateEvents([
      ...failedLogins(6),
      ...failedLogins(6).map((e, i) => ({
        ...e,
        id: `late-${i}`,
        at: at(far + i * 4000),
      })),
    ]);

    expect(candidates.length).toBe(2);
  });

  it('respects a custom window', () => {
    const events = [
      ...failedLogins(6),
      ...failedLogins(6).map((e, i) => ({
        ...e,
        id: `late-${i}`,
        at: at(120000 + i * 4000),
      })),
    ];

    expect(correlateEvents(events, { windowMs: 60000 }).candidates.length).toBe(2);
    expect(correlateEvents(events, { windowMs: 600000 }).candidates.length).toBe(1);
  });
});

describe('rules', () => {
  it('requires enough failures before calling it a burst', () => {
    const few = correlateEvents(failedLogins(3), { minConfidence: 0 }).candidates[0];
    const many = correlateEvents(failedLogins(9), { minConfidence: 0 }).candidates[0];

    expect(few.matchedRules.map((r) => r.id)).not.toContain('AUTH_FAILURE_BURST');
    expect(many.matchedRules.map((r) => r.id)).toContain('AUTH_FAILURE_BURST');
  });

  it('only matches the escalation sequence when the order is right', () => {
    const shared = { sourceIp: '10.0.0.9', userId: 'admin', privileged: true };
    const correct = correlateEvents([
      { id: '1', type: 'FAILED_LOGIN', at: at(0), ...shared },
      { id: '2', type: 'PRIVILEGE_ESCALATION', at: at(60000), ...shared },
      { id: '3', type: 'SENSITIVE_API_ACCESS', at: at(120000), ...shared },
    ], { minConfidence: 0 }).candidates[0];

    const reversed = correlateEvents([
      { id: '1', type: 'PRIVILEGE_ESCALATION', at: at(0), ...shared },
      { id: '2', type: 'FAILED_LOGIN', at: at(60000), ...shared },
      { id: '3', type: 'SENSITIVE_API_ACCESS', at: at(120000), ...shared },
    ], { minConfidence: 0 }).candidates[0];

    expect(correct.matchedRules.map((r) => r.id)).toContain('ESCALATION_SEQUENCE');
    expect(reversed.matchedRules.map((r) => r.id)).not.toContain(
      'ESCALATION_SEQUENCE'
    );
  });

  it('needs three services before calling activity multi-service', () => {
    const base = { sourceIp: '10.0.0.4', userId: 'dana' };
    const two = correlateEvents([
      { id: '1', type: 'FAILED_LOGIN', at: at(0), service: 'auth', ...base },
      { id: '2', type: 'API_LATENCY', at: at(1000), service: 'core-api', ...base },
    ], { minConfidence: 0 }).candidates[0];

    const three = correlateEvents([
      { id: '1', type: 'FAILED_LOGIN', at: at(0), service: 'auth', ...base },
      { id: '2', type: 'API_LATENCY', at: at(1000), service: 'core-api', ...base },
      { id: '3', type: 'DATABASE_ERROR', at: at(2000), service: 'database', ...base },
    ], { minConfidence: 0 }).candidates[0];

    expect(two.matchedRules.map((r) => r.id)).not.toContain('MULTI_SERVICE_SPREAD');
    expect(three.matchedRules.map((r) => r.id)).toContain('MULTI_SERVICE_SPREAD');
  });

  it('every rule declares an id, label and weight', () => {
    CORRELATION_RULES.forEach((rule) => {
      expect(rule.id).toEqual(expect.any(String));
      expect(rule.label).toEqual(expect.any(String));
      expect(rule.weight).toBeGreaterThan(0);
      expect(Array.isArray(rule.signals)).toBe(true);
    });
  });
});

describe('classification', () => {
  it('falls back to unclassified correlated activity when no pattern is earned', () => {
    const [c] = correlateEvents([
      { id: '1', type: 'API_LATENCY', at: at(0), sourceIp: '10.0.0.7' },
      { id: '2', type: 'API_LATENCY', at: at(2000), sourceIp: '10.0.0.7' },
    ], { minConfidence: 0 }).candidates;

    expect(c.classified).toBe(false);
    expect(c.pattern).toBe('CORRELATED_ACTIVITY');
  });

  it('prefers the more specific pattern when several would match', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    // Both BRUTE_FORCE and CREDENTIAL_ATTACK are satisfied here.
    expect(c.pattern).toBe('CREDENTIAL_ATTACK');
  });
});

describe('confidence', () => {
  it('rises as more independent rules match', () => {
    const weak = correlateEvents(failedLogins(6), { minConfidence: 0 })
      .candidates[0].confidence;
    const strong = correlateEvents(credentialAttack()).candidates[0].confidence;
    expect(strong).toBeGreaterThan(weak);
  });

  it('stays within 0-100', () => {
    const [c] = correlateEvents(credentialAttack()).candidates;
    expect(c.confidence).toBeGreaterThanOrEqual(0);
    expect(c.confidence).toBeLessThanOrEqual(100);
  });

  it('drops candidates below the confidence floor', () => {
    const low = correlateEvents(failedLogins(2), { minConfidence: 95 });
    expect(low.candidates).toHaveLength(0);
  });

  it('sorts candidates by confidence', () => {
    const { candidates } = correlateEvents([
      ...credentialAttack(),
      ...failedLogins(6).map((e, i) => ({
        ...e,
        id: `other-${i}`,
        sourceIp: '198.51.100.4',
        userId: 'other-user',
        privileged: false,
      })),
    ], { minConfidence: 0 });

    expect(candidates.length).toBeGreaterThan(1);
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(
        candidates[i].confidence
      );
    }
  });
});

describe('invalid input', () => {
  it('handles no input at all', () => {
    expect(correlateEvents().candidates).toEqual([]);
    expect(correlateEvents(null).stats.received).toBe(0);
  });

  it('discards events without a usable timestamp and reports how many', () => {
    const { stats } = correlateEvents([
      ...failedLogins(6),
      { id: 'bad-1', type: 'FAILED_LOGIN', sourceIp: '203.0.113.9' },
      { id: 'bad-2', type: 'FAILED_LOGIN', at: 'not a date', sourceIp: '203.0.113.9' },
      null,
    ]);

    expect(stats.received).toBe(9);
    expect(stats.usable).toBe(6);
    expect(stats.discarded).toBe(3);
  });

  it('accepts epoch milliseconds and Date objects as timestamps', () => {
    const { candidates } = correlateEvents([
      { id: '1', type: 'FAILED_LOGIN', at: T0, sourceIp: '10.0.0.8' },
      { id: '2', type: 'FAILED_LOGIN', at: new Date(T0 + 1000), sourceIp: '10.0.0.8' },
    ], { minConfidence: 0 });

    expect(candidates).toHaveLength(1);
  });

  it('does not mutate the events it is given', () => {
    const events = credentialAttack();
    const snapshot = JSON.parse(JSON.stringify(events));
    correlateEvents(events);
    expect(events).toEqual(snapshot);
  });

  it('is deterministic', () => {
    const events = credentialAttack();
    const a = correlateEvents(events);
    const b = correlateEvents(events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

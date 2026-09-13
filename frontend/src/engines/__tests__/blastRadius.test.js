import { describe, expect, it } from 'vitest';
import {
  HIGH_IMPACT_THRESHOLD,
  computeBlastRadius,
  rankByImpact,
  simulateFailure,
} from '../blastRadius.js';
import { DEFAULT_TOPOLOGY, HEALTH, buildGraph } from '../topology.js';

const graph = () => buildGraph();

describe('computeBlastRadius', () => {
  it('reports what a compromised auth service takes with it', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });

    expect(r.found).toBe(true);
    expect(r.origin.label).toBe('Auth Service');
    expect(r.counts.affected).toBeGreaterThan(0);
    expect(r.affected.map((a) => a.id)).toEqual(
      expect.arrayContaining(['core-api', 'payment'])
    );
  });

  it('separates high-impact dependents from ones that merely degrade', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });

    // core-api depends hard on auth; notification only softly.
    expect(r.highImpact.map((a) => a.id)).toContain('core-api');
    expect(r.highImpact.map((a) => a.id)).not.toContain('notification');
  });

  it('only counts a journey as broken when a node actually loses service', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });
    const broken = r.workflows.map((w) => w.id);

    expect(broken).toContain('checkout'); // payment is hard-dependent
    // Notifications merely degrade, so claiming that journey is down would
    // be a false alarm — and false alarms are how a tool gets ignored.
    expect(broken).not.toContain('notify');
  });

  it('drops dependents below the impact threshold', () => {
    const weak = buildGraph({
      nodes: [
        { id: 'root' },
        { id: 'far', dependsOn: [{ id: 'mid', strength: 'optional' }] },
        { id: 'mid', dependsOn: [{ id: 'root', strength: 'optional' }] },
      ],
    });
    const r = computeBlastRadius(weak, { originId: 'root' });
    expect(r.affected.map((a) => a.id)).not.toContain('far');
  });

  it('honours a custom threshold', () => {
    const loose = computeBlastRadius(graph(), { originId: 'auth', threshold: 0 });
    const strict = computeBlastRadius(graph(), { originId: 'auth', threshold: 0.9 });
    expect(loose.counts.affected).toBeGreaterThan(strict.counts.affected);
  });

  it('projects a health drop, weighted by what failed', () => {
    const auth = computeBlastRadius(graph(), { originId: 'auth' });
    const notification = computeBlastRadius(graph(), { originId: 'notification' });

    expect(auth.health.after).toBeLessThan(auth.health.before);
    expect(auth.health.delta).toBeLessThan(notification.health.delta);
  });

  it('accounts for services that were already unhealthy', () => {
    const clean = computeBlastRadius(graph(), { originId: 'payment' });
    const alreadyDegraded = computeBlastRadius(graph(), {
      originId: 'payment',
      healthById: { storage: HEALTH.CRITICAL },
    });
    expect(alreadyDegraded.health.before).toBeLessThan(clean.health.before);
  });

  it('raises risk through the risk engine, not a number of its own', () => {
    const r = computeBlastRadius(graph(), {
      originId: 'auth',
      riskContext: { signals: ['UNKNOWN_EXTERNAL_IP'] },
    });

    expect(r.risk.after).toBeGreaterThan(r.risk.before);
    expect(r.risk.delta).toBe(r.risk.after - r.risk.before);
    expect(r.risk.addedSignals.length).toBeGreaterThan(0);
  });

  it('derives the added signals from what the topology knows', () => {
    const auth = computeBlastRadius(graph(), { originId: 'auth' });
    const database = computeBlastRadius(graph(), { originId: 'database' });

    // auth handles identity; the database is a sensitive datastore.
    expect(auth.risk.addedSignals).toContain('PRIVILEGED_ACCOUNT');
    expect(database.risk.addedSignals).toContain('DATA_STORE_REACHED');
    expect(database.risk.addedSignals).toContain('SENSITIVE_RESOURCE_ACCESS');
  });

  it('gives the topology a highlight set including the origin', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });
    expect(r.highlight[0]).toBe('auth');
    expect(r.highlight).toEqual(expect.arrayContaining(['core-api', 'payment']));
  });

  it('orders affected nodes by how hard they are hit', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });
    for (let i = 1; i < r.affected.length; i += 1) {
      expect(r.affected[i - 1].strength).toBeGreaterThanOrEqual(
        r.affected[i].strength
      );
    }
  });

  it('marks high impact at or above the threshold', () => {
    const r = computeBlastRadius(graph(), { originId: 'auth' });
    r.affected.forEach((a) => {
      expect(a.highImpact).toBe(a.strength >= HIGH_IMPACT_THRESHOLD);
    });
  });

  it('returns an empty radius for a leaf node', () => {
    const r = computeBlastRadius(graph(), { originId: 'payment' });
    expect(r.counts.affected).toBe(0);
    expect(r.highImpact).toEqual([]);
  });

  it('reports not found for an unknown node instead of throwing', () => {
    const r = computeBlastRadius(graph(), { originId: 'ghost' });
    expect(r.found).toBe(false);
    expect(r.origin).toBeNull();
    expect(r.affected).toEqual([]);
  });

  it('survives being called with nothing', () => {
    expect(() => computeBlastRadius()).not.toThrow();
    expect(computeBlastRadius().found).toBe(false);
  });

  it('terminates on a cyclic dependency graph', () => {
    const cyclic = buildGraph({
      nodes: [
        { id: 'a', dependsOn: ['c'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ],
    });
    const r = computeBlastRadius(cyclic, { originId: 'a' });
    expect(r.counts.affected).toBe(2);
  });
});

describe('read-only guarantee', () => {
  it('does not mutate the topology', () => {
    const snapshot = JSON.parse(JSON.stringify(DEFAULT_TOPOLOGY));
    computeBlastRadius(buildGraph(DEFAULT_TOPOLOGY), { originId: 'auth' });
    expect(DEFAULT_TOPOLOGY).toEqual(snapshot);
  });

  it('does not mutate the health map or the risk context it was given', () => {
    const healthById = { storage: HEALTH.DEGRADED };
    const riskContext = { signals: ['UNKNOWN_EXTERNAL_IP'] };
    const healthSnapshot = { ...healthById };
    const riskSnapshot = JSON.parse(JSON.stringify(riskContext));

    computeBlastRadius(graph(), { originId: 'auth', healthById, riskContext });

    expect(healthById).toEqual(healthSnapshot);
    expect(riskContext).toEqual(riskSnapshot);
  });

  it('is deterministic', () => {
    const opts = { originId: 'auth', riskContext: { signals: ['PRIVILEGED_ACCOUNT'] } };
    expect(computeBlastRadius(graph(), opts)).toEqual(
      computeBlastRadius(graph(), opts)
    );
  });
});

describe('simulateFailure', () => {
  it('uses the same calculation as the real thing', () => {
    const real = computeBlastRadius(graph(), { originId: 'database' });
    const simulated = simulateFailure(graph(), { originId: 'database' });

    // A simulator that computes impact differently from the real thing is
    // a simulator that lies.
    expect(simulated.counts).toEqual(real.counts);
    expect(simulated.health).toEqual(real.health);
    expect(simulated.simulated).toBe(true);
  });

  it('produces a readable summary', () => {
    const s = simulateFailure(graph(), { originId: 'auth' });
    expect(s.summary.headline).toBe('Auth Service failure');
    expect(s.summary.services).toMatch(/services affected/);
    expect(s.summary.health).toMatch(/Health \d+ → \d+/);
  });

  it('pluralises a single affected service correctly', () => {
    const single = buildGraph({
      nodes: [{ id: 'root' }, { id: 'only', dependsOn: ['root'] }],
    });
    const s = simulateFailure(single, { originId: 'root' });
    expect(s.summary.services).toBe('1 service affected');
  });

  it('has no summary for an unknown node', () => {
    expect(simulateFailure(graph(), { originId: 'ghost' }).summary).toBeNull();
  });
});

describe('rankByImpact', () => {
  it('ranks the gateways and the database above a notification service', () => {
    const ranked = rankByImpact(graph()).map((r) => r.id);
    expect(ranked.indexOf('database')).toBeLessThan(
      ranked.indexOf('notification')
    );
  });

  it('excludes the external boundary', () => {
    expect(rankByImpact(graph()).map((r) => r.id)).not.toContain('internet');
  });

  it('reports the exposure attributes the attack surface panel needs', () => {
    const db = rankByImpact(graph()).find((r) => r.id === 'database');
    const edge = rankByImpact(graph()).find((r) => r.id === 'edge-gateway');

    expect(db.sensitive).toBe(true);
    expect(edge.internetFacing).toBe(true);
    expect(db.healthCost).toBeGreaterThan(0);
  });

  it('handles a graph with no dependencies at all', () => {
    const flat = buildGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    const ranked = rankByImpact(flat);
    expect(ranked).toHaveLength(2);
    ranked.forEach((r) => expect(r.affected).toBe(0));
  });
});

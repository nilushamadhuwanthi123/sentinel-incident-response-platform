import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS,
  applyEvents,
  initialLiveState,
  liveReducer,
} from '../liveStore.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const iso = (ms) => new Date(T0 + ms).toISOString();

const evt = (overrides = {}) => ({
  id: 'e1',
  type: 'FAILED_LOGIN',
  at: iso(0),
  service: 'auth',
  sourceIp: '203.0.113.47',
  userId: 'svc-billing-admin',
  sessionId: 'sess-8841',
  ...overrides,
});

const attack = () => [
  evt({ id: 'a0', type: 'UNKNOWN_IP', at: iso(0), service: 'edge' }),
  ...Array.from({ length: 27 }, (_, i) =>
    evt({ id: `a-fail-${i}`, type: 'FAILED_LOGIN', at: iso(1000 + i * 1000) })
  ),
  evt({ id: 'a1', type: 'PRIVILEGE_ESCALATION', at: iso(40_000) }),
  evt({ id: 'a2', type: 'SENSITIVE_API_ACCESS', at: iso(50_000), service: 'accounts' }),
];

describe('liveReducer', () => {
  it('adds an event and remembers when it happened', () => {
    const state = liveReducer(initialLiveState, { type: 'event:new', payload: evt() });
    expect(state.events).toHaveLength(1);
    expect(state.lastEventAt).toBe(iso(0));
    expect(state.counts.received).toBe(1);
  });

  it('drops a duplicate and counts it', () => {
    // Reconnection replays the server buffer, so the same event genuinely
    // arrives twice. It must not be counted twice by the correlation engine.
    let state = liveReducer(initialLiveState, { type: 'event:new', payload: evt() });
    state = liveReducer(state, { type: 'event:new', payload: evt() });
    expect(state.events).toHaveLength(1);
    expect(state.counts.duplicates).toBe(1);
  });

  it('drops junk rather than storing it', () => {
    let state = liveReducer(initialLiveState, { type: 'event:new', payload: null });
    state = liveReducer(state, { type: 'event:new', payload: { type: 'NO_ID' } });
    expect(state.events).toHaveLength(0);
    expect(state.counts.dropped).toBe(2);
  });

  it('bounds memory, so a console left open overnight does not grow forever', () => {
    const many = Array.from({ length: MAX_EVENTS + 50 }, (_, i) =>
      evt({ id: `e-${i}`, at: iso(i * 1000) })
    );
    const state = applyEvents(many);
    expect(state.events).toHaveLength(MAX_EVENTS);
    // The oldest are the ones dropped.
    expect(state.events[0].id).toBe('e-50');
  });

  it('records service status changes', () => {
    const state = liveReducer(initialLiveState, {
      type: 'service:statusChanged',
      payload: { service: 'auth', status: 'compromised', reason: 'escalation', at: iso(0) },
    });
    expect(state.services.auth.status).toBe('compromised');
  });

  it('ignores a status change with no service', () => {
    const state = liveReducer(initialLiveState, {
      type: 'service:statusChanged',
      payload: { status: 'degraded' },
    });
    expect(state).toBe(initialLiveState);
  });

  it('keeps only recent alerts', () => {
    let state = initialLiveState;
    for (let i = 0; i < 30; i += 1) {
      state = liveReducer(state, { type: 'system:alert', payload: { message: `m${i}` } });
    }
    expect(state.alerts).toHaveLength(20);
    expect(state.alerts[19].message).toBe('m29');
  });

  it('resets to a clean slate', () => {
    const state = applyEvents(attack());
    expect(liveReducer(state, { type: 'reset' }).events).toHaveLength(0);
  });

  it('leaves state untouched for an unknown action', () => {
    expect(liveReducer(initialLiveState, { type: 'what' })).toBe(initialLiveState);
  });
});

describe('derived picture', () => {
  it('correlates the scripted attack into an incident and scores it', () => {
    // The whole reason the reducer derives rather than stores: the incident
    // and the risk number cannot disagree with the events they came from.
    const state = applyEvents(attack());
    expect(state.incidents.length).toBeGreaterThan(0);
    expect(state.incidents[0].confidence).toBeGreaterThan(50);
    expect(state.risk.score).toBeGreaterThan(50);
  });

  it('finds nothing in ambient noise', () => {
    // An engine that correlates everything is indistinguishable from one
    // that correlates nothing.
    const noise = Array.from({ length: 20 }, (_, i) =>
      evt({
        id: `n-${i}`,
        type: 'API_LATENCY',
        at: iso(i * 3000),
        service: 'core-api',
        sourceIp: `198.51.100.${i + 1}`,
        userId: null,
        sessionId: null,
      })
    );
    const state = applyEvents(noise);
    expect(state.incidents).toHaveLength(0);
    expect(state.risk.score).toBe(0);
  });

  it('raises risk as the attack escalates, not all at once', () => {
    const steps = attack();
    const early = applyEvents(steps.slice(0, 10));
    const full = applyEvents(steps);
    expect(full.risk.score).toBeGreaterThan(early.risk.score);
  });

  it('does not mutate the events it was given', () => {
    const events = attack();
    const snapshot = JSON.parse(JSON.stringify(events));
    applyEvents(events);
    expect(events).toEqual(snapshot);
  });

  it('is deterministic', () => {
    expect(applyEvents(attack())).toEqual(applyEvents(attack()));
  });

  it('reaches the same state whether events arrive one by one or in a batch', () => {
    // Replay depends on this: replaying an incident is just folding the
    // same events again.
    const events = attack();
    const oneByOne = events.reduce(
      (s, payload) => liveReducer(s, { type: 'event:new', payload }),
      initialLiveState
    );
    expect(applyEvents(events).events).toEqual(oneByOne.events);
    expect(applyEvents(events).risk.score).toBe(oneByOne.risk.score);
  });
});

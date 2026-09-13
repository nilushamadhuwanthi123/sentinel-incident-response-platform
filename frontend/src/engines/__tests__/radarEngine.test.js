import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DECAY_MS,
  EVENT_MAPPING,
  SIGNAL_CATEGORIES,
  buildRadarFrame,
  linkSignalsToServices,
  mapSignal,
  recencyOf,
} from '../radarEngine.js';

const NOW = Date.parse('2026-09-13T09:47:00.000Z');
const ago = (ms) => NOW - ms;

const event = (overrides = {}) => ({
  id: 'evt-1',
  type: 'FAILED_LOGIN',
  at: ago(5000),
  service: 'auth',
  ...overrides,
});

describe('mapSignal', () => {
  it('places a signal in the sector its category owns', () => {
    const identity = mapSignal(event({ type: 'FAILED_LOGIN' }), { now: NOW });
    const data = mapSignal(event({ type: 'SENSITIVE_API_ACCESS' }), { now: NOW });

    expect(identity.category).toBe('IDENTITY');
    expect(identity.bearing).toBeGreaterThanOrEqual(SIGNAL_CATEGORIES.IDENTITY.from);
    expect(identity.bearing).toBeLessThan(SIGNAL_CATEGORIES.IDENTITY.to);

    expect(data.category).toBe('DATA');
    expect(data.bearing).toBeGreaterThanOrEqual(SIGNAL_CATEGORIES.DATA.from);
    expect(data.bearing).toBeLessThan(SIGNAL_CATEGORIES.DATA.to);
  });

  it('is stable: the same event always lands in the same place', () => {
    // A blip that moves on every render is unreadable, which is why
    // position comes from a hash of the event's identity and not Math.random.
    const a = mapSignal(event(), { now: NOW });
    const b = mapSignal(event(), { now: NOW });
    expect(a.bearing).toBe(b.bearing);
  });

  it('gives different events different positions within a sector', () => {
    const a = mapSignal(event({ id: 'evt-a' }), { now: NOW });
    const b = mapSignal(event({ id: 'evt-b' }), { now: NOW });
    expect(a.bearing).not.toBe(b.bearing);
  });

  it('puts worse signals closer to the centre', () => {
    const mild = mapSignal(event({ type: 'API_LATENCY' }), { now: NOW });
    const severe = mapSignal(event({ type: 'PRIVILEGE_ESCALATION' }), { now: NOW });
    expect(severe.distance).toBeLessThan(mild.distance);
  });

  it('sizes a signal by confidence, so an uncertain one is visibly smaller', () => {
    const unsure = mapSignal(event({ confidence: 20 }), { now: NOW });
    const certain = mapSignal(event({ confidence: 95 }), { now: NOW });
    expect(certain.radius).toBeGreaterThan(unsure.radius);
  });

  it('fades with age', () => {
    const fresh = mapSignal(event({ at: ago(1000) }), { now: NOW });
    const old = mapSignal(event({ at: ago(DEFAULT_DECAY_MS / 2) }), { now: NOW });
    expect(old.intensity).toBeLessThan(fresh.intensity);
  });

  it('holds a critical signal at full intensity until it is acknowledged', () => {
    // A critical alert that quietly disappears on a timer is an alert
    // nobody saw.
    const stale = event({
      type: 'PRIVILEGE_ESCALATION',
      severityScore: 92,
      at: ago(DEFAULT_DECAY_MS * 4),
    });

    const unacknowledged = mapSignal(stale, { now: NOW });
    expect(unacknowledged.intensity).toBe(1);
    expect(unacknowledged.persistent).toBe(true);
    expect(unacknowledged.faded).toBe(false);

    const acknowledged = mapSignal({ ...stale, acknowledged: true }, { now: NOW });
    expect(acknowledged.intensity).toBe(0);
    expect(acknowledged.persistent).toBe(false);
  });

  it('carries the detail the inspector shows', () => {
    const s = mapSignal(
      event({ sourceIp: '203.0.113.9', userId: 'svc-admin', incidentId: 'inc-1' }),
      { now: NOW }
    );
    expect(s.detail).toMatchObject({
      type: 'FAILED_LOGIN',
      source: '203.0.113.9',
      user: 'svc-admin',
      service: 'auth',
      incidentId: 'inc-1',
    });
  });

  it('falls back to the application sector for an unmapped event type', () => {
    const s = mapSignal(event({ type: 'SOMETHING_NEW' }), { now: NOW });
    expect(s.category).toBe('APPLICATION');
    expect(s.type).toBe('SOMETHING_NEW');
  });

  it('accepts ISO strings, epoch milliseconds and Date objects', () => {
    const iso = mapSignal(event({ at: new Date(ago(1000)).toISOString() }), { now: NOW });
    const epoch = mapSignal(event({ at: ago(1000) }), { now: NOW });
    const date = mapSignal(event({ at: new Date(ago(1000)) }), { now: NOW });
    expect(iso.ageMs).toBe(1000);
    expect(epoch.ageMs).toBe(1000);
    expect(date.ageMs).toBe(1000);
  });

  it('treats an unusable timestamp as now rather than throwing', () => {
    const s = mapSignal(event({ at: 'not a date' }), { now: NOW });
    expect(s.ageMs).toBe(0);
  });

  it('returns null for something that is not an event', () => {
    expect(mapSignal(null)).toBeNull();
    expect(mapSignal('FAILED_LOGIN')).toBeNull();
  });

  it('keeps every derived value inside its range', () => {
    Object.keys(EVENT_MAPPING).forEach((type) => {
      const s = mapSignal(event({ type, id: type }), { now: NOW });
      expect(s.distance).toBeGreaterThanOrEqual(0);
      expect(s.distance).toBeLessThanOrEqual(1);
      expect(s.radius).toBeGreaterThan(0);
      expect(s.radius).toBeLessThanOrEqual(1);
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
      expect(s.bearing).toBeGreaterThanOrEqual(0);
      expect(s.bearing).toBeLessThan(360);
    });
  });
});

describe('recencyOf', () => {
  it('is 1 for something that just happened and 0 once fully decayed', () => {
    expect(recencyOf(0)).toBe(1);
    expect(recencyOf(DEFAULT_DECAY_MS)).toBe(0);
    expect(recencyOf(DEFAULT_DECAY_MS * 2)).toBe(0);
  });

  it('is halfway through the window at half the decay', () => {
    expect(recencyOf(DEFAULT_DECAY_MS / 2)).toBeCloseTo(0.5);
  });

  it('tolerates nonsense rather than returning NaN', () => {
    expect(recencyOf(NaN)).toBe(1);
    expect(recencyOf(-100)).toBe(1);
    expect(recencyOf(1000, 0)).toBe(0);
  });
});

describe('buildRadarFrame', () => {
  const frame = (extra = []) =>
    buildRadarFrame(
      [
        event({ id: 'e1', type: 'FAILED_LOGIN', at: ago(5000) }),
        event({ id: 'e2', type: 'PRIVILEGE_ESCALATION', at: ago(20000), severityScore: 92 }),
        event({ id: 'e3', type: 'SENSITIVE_API_ACCESS', at: ago(30000), service: 'core-api' }),
        ...extra,
      ],
      { now: NOW }
    );

  it('maps every usable event', () => {
    expect(frame().counts.total).toBe(3);
  });

  it('drops signals that have fully faded', () => {
    const f = frame([
      event({ id: 'old', type: 'API_LATENCY', at: ago(DEFAULT_DECAY_MS * 2) }),
    ]);
    expect(f.signals.map((s) => s.id)).not.toContain('old');
    expect(f.counts.dropped).toBe(1);
  });

  it('keeps a faded critical signal, because it is persistent', () => {
    const f = frame([
      event({
        id: 'old-critical',
        type: 'PRIVILEGE_ESCALATION',
        severityScore: 95,
        at: ago(DEFAULT_DECAY_MS * 3),
      }),
    ]);
    expect(f.signals.map((s) => s.id)).toContain('old-critical');
  });

  it('paints the most urgent signal last, so it is on top', () => {
    const f = frame();
    const scores = f.signals.map((s) => s.severityScore);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('counts critical and unacknowledged signals', () => {
    // Two of the three are critical: privilege escalation (92) and
    // sensitive API access, which the catalogue weights at 78 — reaching a
    // sensitive resource is a critical signal on its own, not only when it
    // is loud.
    const f = frame();
    expect(f.counts.critical).toBe(2);
    expect(f.counts.unacknowledged).toBe(2);
  });

  it('breaks the picture down by category', () => {
    const byId = Object.fromEntries(frame().byCategory.map((c) => [c.id, c.count]));
    expect(byId.IDENTITY).toBe(2);
    expect(byId.DATA).toBe(1);
    expect(byId.NETWORK).toBe(0);
  });

  it('produces an accessible summary from the same data as the picture', () => {
    // The screen-reader experience is generated from the signals
    // themselves, so it cannot fall behind what is drawn.
    const f = frame();
    expect(f.summary).toContain('3 active signals');
    expect(f.summary).toContain('2 critical');
    expect(f.summary).toContain('identity');
  });

  it('says so plainly when the scope is clear', () => {
    const f = buildRadarFrame([], { now: NOW });
    expect(f.summary).toBe('No active signals.');
    expect(f.counts.total).toBe(0);
  });

  it('uses the singular for one signal', () => {
    const f = buildRadarFrame([event()], { now: NOW });
    expect(f.summary).toContain('1 active signal,');
  });

  it('survives junk in the event list', () => {
    const f = buildRadarFrame([event(), null, 'nonsense', undefined], { now: NOW });
    expect(f.counts.total).toBe(1);
    expect(f.counts.dropped).toBe(3);
  });

  it('handles no input at all', () => {
    expect(buildRadarFrame().counts.total).toBe(0);
    expect(buildRadarFrame(null).summary).toBe('No active signals.');
  });

  it('does not mutate the events it was given', () => {
    const events = [event({ id: 'a' }), event({ id: 'b' })];
    const snapshot = JSON.parse(JSON.stringify(events));
    buildRadarFrame(events, { now: NOW });
    expect(events).toEqual(snapshot);
  });

  it('is deterministic for the same instant', () => {
    expect(frame()).toEqual(frame());
  });
});

describe('linkSignalsToServices', () => {
  it('groups signals by the service they touch', () => {
    const { signals } = buildRadarFrame(
      [
        event({ id: 'a', service: 'auth' }),
        event({ id: 'b', service: 'auth' }),
        event({ id: 'c', service: 'core-api' }),
      ],
      { now: NOW }
    );

    const links = linkSignalsToServices(signals);
    expect(links[0].service).toBe('auth');
    expect(links[0].count).toBe(2);
  });

  it('reports the worst severity touching each service', () => {
    const { signals } = buildRadarFrame(
      [
        event({ id: 'a', service: 'auth', type: 'API_LATENCY' }),
        event({ id: 'b', service: 'auth', type: 'PRIVILEGE_ESCALATION', severityScore: 94 }),
      ],
      { now: NOW }
    );

    expect(linkSignalsToServices(signals)[0].worstSeverity).toBe('critical');
  });

  it('ignores signals with no service', () => {
    const { signals } = buildRadarFrame(
      [event({ id: 'a', service: null }), event({ id: 'b', service: 'auth' })],
      { now: NOW }
    );
    const links = linkSignalsToServices(signals);
    expect(links).toHaveLength(1);
    expect(links[0].service).toBe('auth');
  });

  it('handles being given nothing', () => {
    expect(linkSignalsToServices()).toEqual([]);
    expect(linkSignalsToServices([])).toEqual([]);
  });
});

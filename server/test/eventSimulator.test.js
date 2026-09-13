import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createRandom,
  createSimulator,
  expandScenario,
  expandTransitions,
  pickAmbient,
} from '../src/simulation/eventSimulator.js';
import { CREDENTIAL_ATTACK, scenarioDurationSec } from '../src/simulation/scenario.js';

describe('createRandom', () => {
  it('is deterministic for a seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    assert.equal(a(), b());
    assert.equal(a(), b());
  });

  it('differs between seeds', () => {
    assert.notEqual(createRandom(1)(), createRandom(2)());
  });

  it('stays inside [0, 1)', () => {
    const r = createRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });
});

describe('pickAmbient', () => {
  it('always returns an entry from the table', () => {
    const r = createRandom(3);
    for (let i = 0; i < 100; i += 1) {
      assert.ok(pickAmbient(r).type);
    }
  });

  it('respects weight: the heaviest entry is picked most often', () => {
    const r = createRandom(11);
    const counts = {};
    for (let i = 0; i < 2000; i += 1) {
      const e = pickAmbient(r);
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    // API_LATENCY carries weight 6 + 4 across two services; it should lead.
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(top, 'API_LATENCY');
  });
});

describe('expandScenario', () => {
  it('expands repeat steps into individual events', () => {
    const events = expandScenario(CREDENTIAL_ATTACK, 0);
    const failures = events.filter((e) => e.type === 'FAILED_LOGIN');
    assert.equal(failures.length, 27);
  });

  it('produces events in time order', () => {
    const events = expandScenario(CREDENTIAL_ATTACK, 0);
    const times = events.map((e) => e.at);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it('keeps the escalation in the order the correlation engine checks for', () => {
    // ESCALATION_SEQUENCE matches failure -> escalation -> access *in order*.
    // If the scenario emitted them in another order, the demo would prove
    // nothing about the engine.
    const events = expandScenario(CREDENTIAL_ATTACK, 0);
    const first = (type) => events.findIndex((e) => e.type === type);
    assert.ok(first('FAILED_LOGIN') < first('PRIVILEGE_ESCALATION'));
    assert.ok(first('PRIVILEGE_ESCALATION') < first('SENSITIVE_API_ACCESS'));
  });

  it('carries the entity fields the correlation engine groups on', () => {
    const [event] = expandScenario(CREDENTIAL_ATTACK, 0);
    assert.equal(event.sourceIp, CREDENTIAL_ATTACK.sourceIp);
    assert.equal(event.userId, CREDENTIAL_ATTACK.userId);
    assert.equal(event.sessionId, CREDENTIAL_ATTACK.sessionId);
  });

  it('labels every event as simulated', () => {
    // Nothing here is real telemetry, and the payload says so all the way
    // to the client.
    assert.ok(expandScenario(CREDENTIAL_ATTACK, 0).every((e) => e.simulated === true));
    assert.ok(expandTransitions(0).every((t) => t.simulated === true));
  });

  it('gives every event a unique id', () => {
    const events = expandScenario(CREDENTIAL_ATTACK, 0);
    assert.equal(new Set(events.map((e) => e.id)).size, events.length);
  });

  it('is offset by the start time', () => {
    const base = expandScenario(CREDENTIAL_ATTACK, 0);
    const later = expandScenario(CREDENTIAL_ATTACK, 10_000);
    assert.equal(later[0].at - base[0].at, 10_000);
  });
});

describe('createSimulator', () => {
  const collect = (overrides = {}) => {
    const emitted = [];
    const sim = createSimulator({
      emit: (channel, payload) => emitted.push({ channel, payload }),
      loop: false,
      ...overrides,
    });
    return { sim, emitted };
  };

  it('emits nothing until started', () => {
    const { sim, emitted } = collect();
    sim.tick(1_000_000);
    assert.equal(emitted.length, 0);
  });

  it('emits scripted events as their time arrives, not before', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    sim.tick(1000);
    const early = emitted.length;
    sim.tick(15_000);
    assert.ok(emitted.length > early);
    assert.ok(emitted.some((e) => e.payload.type === 'UNKNOWN_IP'));
  });

  it('never emits the same scripted event twice', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    for (let t = 0; t <= 120_000; t += 1000) sim.tick(t);
    const scripted = emitted.filter((e) => e.payload.scenarioId);
    assert.equal(new Set(scripted.map((e) => e.payload.id)).size, scripted.length);
  });

  it('skips a long backlog instead of burying the client on wake', () => {
    // A console showing a ten-minute-old burst as current is worse than one
    // that admits it skipped ahead.
    const { sim, emitted } = collect();
    sim.start(0);
    sim.tick(600_000);
    const stale = emitted.filter((e) => e.payload.scenarioId);
    assert.ok(stale.length < 10, `expected a bounded catch-up, got ${stale.length}`);
  });

  it('emits the scripted service transitions', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    for (let t = 0; t <= 100_000; t += 1000) sim.tick(t);
    const changes = emitted.filter((e) => e.channel === 'service:statusChanged');
    assert.ok(changes.some((c) => c.payload.service === 'auth' && c.payload.status === 'compromised'));
  });

  it('emits ambient noise alongside the script', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    for (let t = 0; t <= 60_000; t += 1000) sim.tick(t);
    assert.ok(emitted.some((e) => e.payload.ambient === true));
  });

  it('does not give ambient noise the attack identity', () => {
    // Otherwise the noise would cluster with the attack and the correlation
    // engine would look clever for the wrong reason.
    const { sim, emitted } = collect();
    sim.start(0);
    for (let t = 0; t <= 90_000; t += 1000) sim.tick(t);
    const ambient = emitted.filter((e) => e.payload.ambient);
    assert.ok(ambient.length > 0);
    assert.ok(ambient.every((e) => e.payload.userId === null));
    assert.ok(ambient.every((e) => e.payload.sourceIp !== CREDENTIAL_ATTACK.sourceIp));
  });

  it('produces an identical feed for the same seed', () => {
    const run = () => {
      const { sim, emitted } = collect({ seed: 99 });
      sim.start(0);
      for (let t = 0; t <= 90_000; t += 1000) sim.tick(t);
      return emitted.map((e) => `${e.channel}:${e.payload.type ?? e.payload.status}`);
    };
    assert.deepEqual(run(), run());
  });

  it('stops on its own when the scenario ends and looping is off', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    const end = scenarioDurationSec() * 1000 + 5000;
    for (let t = 0; t <= end; t += 1000) sim.tick(t);
    assert.equal(sim.running, false);
    assert.ok(emitted.some((e) => e.channel === 'system:alert'));
  });

  it('replays from the start when looping', () => {
    const { sim, emitted } = collect({ loop: true });
    sim.start(0);
    const end = scenarioDurationSec() * 1000 + 5000;
    for (let t = 0; t <= end; t += 1000) sim.tick(t);
    assert.equal(sim.running, true);
    assert.ok(
      emitted.some((e) => e.channel === 'system:alert' && /replayed/i.test(e.payload.message))
    );
  });

  it('emits an ISO timestamp, not a raw number', () => {
    const { sim, emitted } = collect();
    sim.start(0);
    sim.tick(15_000);
    const [first] = emitted;
    assert.equal(typeof first.payload.at, 'string');
    assert.ok(Number.isFinite(Date.parse(first.payload.at)));
  });

  it('survives being constructed with no emit callback', () => {
    const sim = createSimulator({ loop: false });
    sim.start(0);
    assert.doesNotThrow(() => sim.tick(20_000));
  });

  it('exposes the full plan without running', () => {
    const { sim } = collect();
    const plan = sim.plan(0);
    assert.ok(plan.events.length > 30);
    assert.ok(plan.durationMs > 0);
  });
});

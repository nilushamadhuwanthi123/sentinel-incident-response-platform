import { describe, expect, it } from 'vitest';
import {
  CHAIN_STAGES,
  STAGE_OF_EVENT,
  buildChain,
  nextStage,
  stageById,
} from '../attackChain.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => new Date(T0 + ms).toISOString();

const event = (type, ms, overrides = {}) => ({
  id: `${type}-${ms}`,
  type,
  at: at(ms),
  service: 'auth',
  ...overrides,
});

const fullChain = () => [
  event('UNKNOWN_IP', 0, { service: 'edge-gateway' }),
  event('FAILED_LOGIN', 5_000),
  event('FAILED_LOGIN', 9_000),
  event('PRIVILEGE_ESCALATION', 40_000),
  event('SENSITIVE_API_ACCESS', 60_000, { service: 'storage' }),
  event('DATABASE_ERROR', 80_000, { service: 'database' }),
];

describe('buildChain', () => {
  it('places each event in the stage its type belongs to', () => {
    const chain = buildChain(fullChain());
    const byId = Object.fromEntries(chain.stages.map((s) => [s.id, s]));
    expect(byId.RECONNAISSANCE.count).toBe(1);
    expect(byId.INITIAL_ACCESS.count).toBe(2);
    expect(byId.ESCALATION.count).toBe(1);
    expect(byId.COLLECTION.count).toBe(2);
  });

  it('returns every stage, including the ones nothing reached', () => {
    // The empty stages are the point: a view that only draws what happened
    // cannot show how far an attack still has to go.
    const chain = buildChain([event('UNKNOWN_IP', 0)]);
    expect(chain.stages).toHaveLength(CHAIN_STAGES.length);
    expect(chain.stages.filter((s) => !s.reached).length).toBe(
      CHAIN_STAGES.length - 1
    );
  });

  it('reports the furthest stage reached and the progress through the model', () => {
    const chain = buildChain(fullChain());
    expect(chain.furthest.id).toBe('COLLECTION');
    expect(chain.progress).toBeCloseTo(5 / 6);
  });

  it('distinguishes a gap from a stage not yet reached', () => {
    // A gap below the furthest stage means the step was skipped — or the
    // platform never saw it. The second is the more important possibility.
    const chain = buildChain([
      event('UNKNOWN_IP', 0),
      event('SENSITIVE_API_ACCESS', 10_000),
    ]);
    expect(chain.gaps.map((s) => s.id)).toEqual([
      'INITIAL_ACCESS',
      'ESCALATION',
      'DISCOVERY',
    ]);
    expect(chain.ahead.map((s) => s.id)).toEqual(['IMPACT']);
  });

  it('measures how long each stage lasted', () => {
    const chain = buildChain(fullChain());
    const initial = chain.stages.find((s) => s.id === 'INITIAL_ACCESS');
    expect(initial.durationMs).toBe(4_000);
    expect(initial.firstAt).toBe(T0 + 5_000);
    expect(initial.lastAt).toBe(T0 + 9_000);
  });

  it('lists the services each stage touched', () => {
    const chain = buildChain(fullChain());
    const collection = chain.stages.find((s) => s.id === 'COLLECTION');
    expect(collection.services).toEqual(['storage', 'database']);
  });

  it('reports the overall window', () => {
    const chain = buildChain(fullChain());
    expect(chain.window.spanMs).toBe(80_000);
  });

  it('names unmapped event types rather than hiding them', () => {
    // An unmapped type silently landing in whichever branch catches it is
    // how a chain quietly becomes wrong.
    const chain = buildChain([event('SOMETHING_NEW', 0)]);
    expect(chain.unmapped).toEqual(['SOMETHING_NEW']);
    expect(chain.furthest).toBeNull();
  });

  it('discards events with no usable timestamp and counts them', () => {
    const chain = buildChain([
      event('FAILED_LOGIN', 0),
      { id: 'x', type: 'FAILED_LOGIN', at: 'not a date' },
      null,
    ]);
    expect(chain.counts.events).toBe(1);
    expect(chain.counts.discarded).toBe(2);
  });

  it('handles no events at all', () => {
    const chain = buildChain([]);
    expect(chain.furthest).toBeNull();
    expect(chain.progress).toBe(0);
    expect(chain.window).toBeNull();
    expect(chain.summary).toBe('No stage of the chain has been reached.');
  });

  it('handles no input at all', () => {
    expect(buildChain().counts.events).toBe(0);
    expect(buildChain(null).stages).toHaveLength(CHAIN_STAGES.length);
  });

  it('summarises what was reached, what was missed and what would come next', () => {
    const chain = buildChain([
      event('UNKNOWN_IP', 0),
      event('PRIVILEGE_ESCALATION', 10_000),
    ]);
    expect(chain.summary).toMatch(/Reached privilege escalation/i);
    expect(chain.summary).toMatch(/1 earlier stage not observed/i);
    expect(chain.summary).toMatch(/next would be discovery/i);
  });

  it('says so when nothing further exists in the model', () => {
    const chain = buildChain([event('SERVICE_DOWN', 0)]);
    expect(chain.summary).toMatch(/nothing further in this model/i);
  });

  it('does not mutate the events it was given', () => {
    const events = fullChain();
    const snapshot = JSON.parse(JSON.stringify(events));
    buildChain(events);
    expect(events).toEqual(snapshot);
  });

  it('is deterministic', () => {
    expect(buildChain(fullChain())).toEqual(buildChain(fullChain()));
  });

  it('accepts ISO strings, epoch milliseconds and Date objects', () => {
    const iso = buildChain([{ id: 'a', type: 'FAILED_LOGIN', at: at(0) }]);
    const epoch = buildChain([{ id: 'a', type: 'FAILED_LOGIN', at: T0 }]);
    const date = buildChain([{ id: 'a', type: 'FAILED_LOGIN', at: new Date(T0) }]);
    expect(iso.window.from).toBe(T0);
    expect(epoch.window.from).toBe(T0);
    expect(date.window.from).toBe(T0);
  });
});

describe('nextStage', () => {
  it('names what the model says comes next, and refuses to call it a prediction', () => {
    // The platform has no basis for predicting intent, and implying
    // otherwise would be inventing a capability.
    const next = nextStage(buildChain([event('PRIVILEGE_ESCALATION', 0)]));
    expect(next.id).toBe('DISCOVERY');
    expect(next.note).toMatch(/not a prediction/i);
  });

  it('returns null at the end of the model', () => {
    expect(nextStage(buildChain([event('SERVICE_DOWN', 0)]))).toBeNull();
  });

  it('handles being given nothing', () => {
    expect(nextStage()).toBeNull();
    expect(nextStage({})).toBeNull();
  });
});

describe('model integrity', () => {
  it('maps every event type to a stage that exists', () => {
    Object.entries(STAGE_OF_EVENT).forEach(([type, stage]) => {
      expect(stageById(stage), `${type} maps to unknown stage ${stage}`).toBeTruthy();
    });
  });

  it('orders stages uniquely and consecutively', () => {
    const orders = CHAIN_STAGES.map((s) => s.order);
    expect(orders).toEqual([...new Set(orders)]);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

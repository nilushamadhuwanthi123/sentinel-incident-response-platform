/**
 * Deterministic event simulator.
 *
 * This is the thing that makes SENTINEL feel alive, and it is also the
 * thing most likely to be built dishonestly — so two rules hold here.
 *
 * **It does not pretend to be real telemetry.** Everything it emits is
 * scripted in scenario.js or drawn from the ambient noise table. There is
 * no vulnerability scanning, no threat intelligence feed, no model. The
 * payloads are labelled `simulated: true` all the way to the client, and
 * the UI says so.
 *
 * **It is deterministic.** Randomness comes from a seeded PRNG, not
 * Math.random, so the same seed produces the same feed every time. A live
 * system whose behaviour cannot be reproduced cannot be tested, and an
 * intermittently-failing socket test is a test everyone learns to ignore.
 *
 * The simulator owns no socket. It produces events and hands them to a
 * callback, which is what lets the whole thing be driven by a fake clock
 * in a test and by a real interval in the server.
 */

import {
  AMBIENT_EVENTS,
  CREDENTIAL_ATTACK,
  SERVICE_TRANSITIONS,
  scenarioDurationSec,
} from './scenario.js';

/**
 * Mulberry32 — small, fast, and good enough for scheduling noise.
 * Chosen because it is seedable and four lines long: a reader can verify
 * there is nothing hiding in it.
 */
export function createRandom(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted pick from the ambient table, using the supplied PRNG. */
export function pickAmbient(random, table = AMBIENT_EVENTS) {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

/**
 * Expand the scripted scenario into a flat, time-ordered list of events.
 *
 * `repeat` steps expand here rather than at emit time so the whole feed can
 * be inspected — and asserted on — before a single millisecond has passed.
 */
export function expandScenario(scenario = CREDENTIAL_ATTACK, startedAt = 0) {
  const out = [];
  scenario.steps.forEach((step, stepIndex) => {
    const repeat = step.repeat ?? 1;
    const spacing = (step.spacingSec ?? 0) * 1000;
    for (let i = 0; i < repeat; i += 1) {
      out.push({
        id: `${scenario.id}-${stepIndex}-${i}`,
        at: startedAt + step.at * 1000 + i * spacing,
        type: step.type,
        service: step.service,
        sourceIp: scenario.sourceIp,
        userId: scenario.userId,
        sessionId: scenario.sessionId,
        scenarioId: scenario.id,
        note: i === 0 ? (step.note ?? null) : null,
        sequence: i + 1,
        of: repeat,
        simulated: true,
      });
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

/** Scripted service status changes, in the same flat shape. */
export function expandTransitions(startedAt = 0) {
  return SERVICE_TRANSITIONS.map((t, i) => ({
    id: `svc-${i}`,
    at: startedAt + t.at * 1000,
    service: t.service,
    status: t.status,
    reason: t.reason,
    simulated: true,
  }));
}

export const DEFAULT_OPTIONS = Object.freeze({
  seed: 20260913,
  /** Real milliseconds per scenario second. Below 1000 the replay is faster. */
  speed: 1,
  /** Mean gap between ambient events, in scenario seconds. */
  ambientEverySec: 4,
  /** Loop the scenario once it finishes, so a demo left open keeps working. */
  loop: true,
});

/**
 * Build a simulator.
 *
 * @param {object}   options
 * @param {function} options.emit   called with (channel, payload)
 * @param {function} [options.now]  injectable clock, for tests
 */
export function createSimulator(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const emit = typeof options.emit === 'function' ? options.emit : () => {};
  const now = options.now ?? (() => Date.now());

  let random = createRandom(config.seed);
  let startedAt = null;
  let scripted = [];
  let transitions = [];
  let nextScriptIndex = 0;
  let nextTransitionIndex = 0;
  let nextAmbientAt = 0;
  let ambientCount = 0;
  let running = false;

  const durationMs = scenarioDurationSec() * 1000;

  function reset(at) {
    startedAt = at;
    random = createRandom(config.seed + ambientCount);
    scripted = expandScenario(CREDENTIAL_ATTACK, at);
    transitions = expandTransitions(at);
    nextScriptIndex = 0;
    nextTransitionIndex = 0;
    nextAmbientAt = at + config.ambientEverySec * 1000;
  }

  function ambientEvent(at) {
    const template = pickAmbient(random);
    ambientCount += 1;
    return {
      id: `amb-${ambientCount}`,
      at,
      type: template.type,
      service: template.service,
      // Ambient noise deliberately carries no shared identity. If it did,
      // it would cluster with the attack and the correlation engine would
      // look clever for the wrong reason.
      sourceIp: `198.51.100.${(ambientCount % 200) + 1}`,
      userId: null,
      sessionId: null,
      scenarioId: null,
      ambient: true,
      simulated: true,
    };
  }

  /**
   * Advance the simulation to `at`, emitting everything now due.
   *
   * Catch-up is bounded: if the process was suspended for ten minutes, the
   * client is not buried under ten minutes of backlog on wake. Events that
   * were missed are dropped and counted, because an operations console
   * showing a ten-minute-old burst as current is worse than one admitting
   * it skipped ahead.
   */
  function tick(at = now()) {
    if (!running) return { emitted: 0, skipped: 0 };
    if (startedAt === null) reset(at);

    let emitted = 0;
    let skipped = 0;
    const horizon = 30_000;

    while (nextScriptIndex < scripted.length && scripted[nextScriptIndex].at <= at) {
      const event = scripted[nextScriptIndex];
      nextScriptIndex += 1;
      if (at - event.at > horizon) {
        skipped += 1;
        continue;
      }
      emit('event:new', { ...event, at: new Date(event.at).toISOString() });
      emitted += 1;
    }

    while (
      nextTransitionIndex < transitions.length &&
      transitions[nextTransitionIndex].at <= at
    ) {
      const t = transitions[nextTransitionIndex];
      nextTransitionIndex += 1;
      if (at - t.at > horizon) {
        skipped += 1;
        continue;
      }
      emit('service:statusChanged', { ...t, at: new Date(t.at).toISOString() });
      emitted += 1;
    }

    while (nextAmbientAt <= at) {
      const event = ambientEvent(nextAmbientAt);
      if (at - nextAmbientAt <= horizon) {
        emit('event:new', { ...event, at: new Date(event.at).toISOString() });
        emitted += 1;
      } else {
        skipped += 1;
      }
      // Jitter the gap so the noise does not arrive on a metronome, which
      // reads as fake immediately.
      const jitter = 0.5 + random();
      nextAmbientAt += config.ambientEverySec * 1000 * jitter;
    }

    const finished =
      nextScriptIndex >= scripted.length &&
      nextTransitionIndex >= transitions.length &&
      at - startedAt > durationMs;

    if (finished) {
      if (config.loop) {
        emit('system:alert', {
          level: 'info',
          message: 'Simulation replayed from the start.',
          simulated: true,
          at: new Date(at).toISOString(),
        });
        reset(at);
      } else {
        running = false;
        emit('system:alert', {
          level: 'info',
          message: 'Simulation complete.',
          simulated: true,
          at: new Date(at).toISOString(),
        });
      }
    }

    return { emitted, skipped };
  }

  return {
    start(at = now()) {
      running = true;
      reset(at);
      return this;
    },
    stop() {
      running = false;
      return this;
    },
    tick,
    get running() {
      return running;
    },
    /** Everything the scenario will emit, for tests and for the docs. */
    plan(at = 0) {
      return {
        events: expandScenario(CREDENTIAL_ATTACK, at),
        transitions: expandTransitions(at),
        durationMs,
      };
    },
  };
}

/**
 * Attack chain reconstruction.
 *
 * Correlation says *these events are one incident*. This says *this is the
 * shape of it*: which stage each event belongs to, how long the attacker
 * spent in each, and — the part that matters — **which stages have not
 * happened yet**.
 *
 * An analyst looking at a live incident is not mainly asking what has
 * happened. They are asking how far it has got and what comes next, because
 * that is what decides whether to contain now or watch a little longer.
 *
 * ## On naming
 *
 * The stages below are a **simplified model**, not a MITRE ATT&CK mapping.
 * They borrow the vocabulary because it is the vocabulary analysts use, but
 * this platform does not implement ATT&CK's technique taxonomy and does not
 * claim to. Saying "ATT&CK-mapped" would be the kind of borrowed
 * credibility that falls apart the moment somebody who knows ATT&CK looks
 * at it.
 *
 * Pure module: events in, structure out. No React, no clock of its own.
 */

import { severityOf } from './severity.js';

/**
 * Stages, in the order an intrusion generally moves through them.
 *
 * `order` is what makes progression measurable; without it "how far has
 * this got" has no answer.
 */
export const CHAIN_STAGES = Object.freeze([
  {
    id: 'RECONNAISSANCE',
    order: 1,
    label: 'Reconnaissance',
    description: 'Probing from an unfamiliar source, before anything is reached.',
  },
  {
    id: 'INITIAL_ACCESS',
    order: 2,
    label: 'Initial access',
    description: 'Attempts to authenticate as somebody.',
  },
  {
    id: 'ESCALATION',
    order: 3,
    label: 'Privilege escalation',
    description: 'A session gains rights it did not start with.',
  },
  {
    id: 'DISCOVERY',
    order: 4,
    label: 'Discovery',
    description: 'Moving between services, finding what is reachable.',
  },
  {
    id: 'COLLECTION',
    order: 5,
    label: 'Collection',
    description: 'Sensitive resources and data stores are reached.',
  },
  {
    id: 'IMPACT',
    order: 6,
    label: 'Impact',
    description: 'Service behaviour degrades under the activity.',
  },
]);

const STAGE_BY_ID = Object.fromEntries(CHAIN_STAGES.map((s) => [s.id, s]));

/**
 * Which stage each event type belongs to.
 *
 * A table rather than a chain of conditionals, so an unmapped event type is
 * visibly unmapped instead of silently landing in whichever branch happens
 * to catch it.
 */
export const STAGE_OF_EVENT = Object.freeze({
  UNKNOWN_IP: 'RECONNAISSANCE',
  REQUEST_SPIKE: 'RECONNAISSANCE',
  FAILED_LOGIN: 'INITIAL_ACCESS',
  PRIVILEGE_ESCALATION: 'ESCALATION',
  API_LATENCY: 'IMPACT',
  SERVICE_DOWN: 'IMPACT',
  SENSITIVE_API_ACCESS: 'COLLECTION',
  DATABASE_ERROR: 'COLLECTION',
});

const toMillis = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Build the chain for one set of events.
 *
 * Returns every stage, including the ones nothing has reached — the empty
 * ones are the point. A view that only draws what happened cannot show how
 * far an attack still has to go.
 */
export function buildChain(events, options = {}) {
  const list = Array.isArray(events) ? events : [];

  const usable = list
    .map((event) => {
      if (!event || typeof event !== 'object') return null;
      const atMs = toMillis(event.at ?? event.timestamp);
      if (atMs === null) return null;
      const stageId = STAGE_OF_EVENT[event.type] ?? null;
      return { event, atMs, stageId };
    })
    .filter(Boolean)
    .sort((a, b) => a.atMs - b.atMs);

  const unmapped = usable.filter((e) => !e.stageId);
  const discarded = list.length - usable.length;

  const stages = CHAIN_STAGES.map((stage) => {
    const matched = usable.filter((e) => e.stageId === stage.id);
    const times = matched.map((e) => e.atMs);

    return {
      ...stage,
      reached: matched.length > 0,
      count: matched.length,
      firstAt: times.length ? Math.min(...times) : null,
      lastAt: times.length ? Math.max(...times) : null,
      /** How long the activity in this stage lasted. */
      durationMs: times.length ? Math.max(...times) - Math.min(...times) : 0,
      services: [...new Set(matched.map((e) => e.event.service).filter(Boolean))],
      events: matched.map((e) => ({
        id: e.event.id,
        type: e.event.type,
        at: e.atMs,
        service: e.event.service ?? null,
        severity: severityOf(e.event.severityScore ?? 50),
      })),
    };
  });

  const reached = stages.filter((s) => s.reached);
  const furthest = reached.length
    ? reached.reduce((a, b) => (b.order > a.order ? b : a))
    : null;

  /**
   * Stages that were skipped, not simply not-yet-reached.
   *
   * A gap below the furthest stage means either the attacker did not need
   * that step or **the platform did not see it**. The second possibility is
   * the more important one and the interface says so, because a confident
   * chain with an invisible hole in it is worse than an uncertain one.
   */
  const gaps = furthest
    ? stages.filter((s) => !s.reached && s.order < furthest.order)
    : [];

  const ahead = furthest
    ? stages.filter((s) => !s.reached && s.order > furthest.order)
    : stages;

  const allTimes = usable.map((e) => e.atMs);

  return {
    stages,
    furthest,
    /** 0–1: how far along the model this incident has travelled. */
    progress: furthest ? furthest.order / CHAIN_STAGES.length : 0,
    gaps,
    ahead,
    unmapped: unmapped.map((e) => e.event.type),
    counts: {
      events: usable.length,
      stagesReached: reached.length,
      stagesTotal: CHAIN_STAGES.length,
      discarded,
    },
    window: allTimes.length
      ? {
          from: Math.min(...allTimes),
          to: Math.max(...allTimes),
          spanMs: Math.max(...allTimes) - Math.min(...allTimes),
        }
      : null,
    summary: describeChain(furthest, reached, gaps, ahead),
    ...(options.now ? { now: options.now } : {}),
  };
}

function describeChain(furthest, reached, gaps, ahead) {
  if (!furthest) return 'No stage of the chain has been reached.';

  const parts = [
    `Reached ${furthest.label.toLowerCase()}, ${reached.length} of ${
      CHAIN_STAGES.length
    } stages`,
  ];

  if (gaps.length > 0) {
    parts.push(
      `${gaps.length} earlier stage${gaps.length === 1 ? '' : 's'} not observed`
    );
  }

  if (ahead.length > 0) {
    parts.push(`next would be ${ahead[0].label.toLowerCase()}`);
  } else {
    parts.push('nothing further in this model');
  }

  return `${parts.join('. ')}.`;
}

/**
 * What the next step would most likely be.
 *
 * Deliberately phrased as *what this model says comes next*, not as a
 * prediction. The platform has no basis for predicting an attacker's
 * intent, and implying otherwise would be inventing a capability.
 */
export function nextStage(chain) {
  const ahead = chain?.ahead ?? [];
  if (ahead.length === 0) return null;
  const next = ahead[0];
  return {
    ...next,
    note:
      'The next stage in this model. Not a prediction of intent — the ' +
      'platform has no basis for one.',
  };
}

/** Stage lookup, so a caller never has to re-derive the table. */
export const stageById = (id) => STAGE_BY_ID[id] ?? null;

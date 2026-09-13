/**
 * Response recommendation and what-if simulation.
 *
 * The hard question in incident response is not "how bad is this" — the
 * risk engine answers that. It is **"what should I do first, and what does
 * it cost me?"** Every containment action has a price: isolating a service
 * takes it offline, revoking sessions signs out everyone who was working,
 * rotating credentials cannot be undone. A tool that recommends actions
 * without naming their cost is recommending blind.
 *
 * So a recommendation here is never a single number. It carries the risk it
 * removes, what it breaks, whether it can be taken back, and how confident
 * the platform is that it applies — and the ranking is explicit about which
 * of those it traded against which.
 *
 * Two rules hold throughout:
 *
 * **Nothing here decides what a signal or an action is worth.** Those
 * numbers live in the risk engine's catalogues. This module orders and
 * combines; it does not re-score, because two places deciding the same
 * thing is two places to be inconsistent.
 *
 * **Simulation is the same code path as the real calculation.** A what-if
 * that computes differently from the live view is a what-if that lies.
 */

import {
  RESPONSE_CATALOG,
  computeRisk,
} from './riskEngine.js';
import { CRITICAL_THRESHOLD, severityOf } from './severity.js';

/**
 * What a response costs to take, as an ordered scale.
 *
 * Service impact and irreversibility are different kinds of cost and are
 * kept separate: a reversible action with high service impact (isolation)
 * and an irreversible one with medium impact (credential rotation) are not
 * interchangeable, and collapsing them into one "cost" number would hide
 * exactly the distinction an analyst is weighing.
 */
export const SERVICE_IMPACT_COST = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});

export const CONFIDENCE_WEIGHT = Object.freeze({
  low: 0.6,
  medium: 0.8,
  high: 1,
});

/**
 * Which signals make which responses *applicable*.
 *
 * An action that cannot address anything observed should not be
 * recommended at all — not ranked last. Recommending account lockout when
 * no identity is involved is noise that teaches an analyst to ignore the
 * list.
 */
export const APPLICABILITY = Object.freeze({
  LOCK_ACCOUNT: ['REPEATED_AUTH_FAILURE', 'PRIVILEGED_ACCOUNT', 'PRIVILEGE_ESCALATION'],
  BLOCK_SOURCE_IP: ['UNKNOWN_EXTERNAL_IP', 'REPEATED_AUTH_FAILURE', 'RAPID_EVENT_BURST'],
  REVOKE_SESSIONS: ['PRIVILEGE_ESCALATION', 'PRIVILEGED_ACCOUNT'],
  ROTATE_CREDENTIALS: ['PRIVILEGE_ESCALATION', 'PRIVILEGED_ACCOUNT', 'MFA_ABSENT'],
  ISOLATE_SERVICE: [
    'SENSITIVE_RESOURCE_ACCESS',
    'DATA_STORE_REACHED',
    'MULTI_SERVICE_SPREAD',
  ],
  ENFORCE_MFA: ['MFA_ABSENT', 'REPEATED_AUTH_FAILURE'],
});

const signalId = (signal) =>
  typeof signal === 'string' ? signal : signal?.id ?? null;

/**
 * Evaluate one response against the current state.
 *
 * Returns what it would achieve and what it would cost, both derived by
 * running the risk engine with and without it. No separate model of a
 * response's value exists here — there is one, in the catalogue, and this
 * reads it through the engine that owns it.
 */
export function evaluateResponse(id, context = {}) {
  const entry = RESPONSE_CATALOG[id];
  if (!entry) return null;

  const signals = context.signals ?? [];
  const applied = context.responses ?? [];

  const before = computeRisk({ ...context, responses: applied });
  const after = computeRisk({ ...context, responses: [...applied, { id }] });

  const reduction = before.score - after.score;
  const observed = new Set(signals.map(signalId).filter(Boolean));
  const addresses = (APPLICABILITY[id] ?? []).filter((s) => observed.has(s));

  const serviceCost = SERVICE_IMPACT_COST[entry.serviceImpact] ?? 2;
  const confidence = CONFIDENCE_WEIGHT[entry.confidence] ?? 0.8;

  /**
   * Value per unit of disruption, discounted by confidence.
   *
   * Irreversibility is a penalty rather than a veto: rotating credentials
   * is sometimes exactly the right call. It should simply have to be worth
   * more than a reversible action to be ranked above one.
   */
  const score =
    reduction === 0
      ? 0
      : (reduction * confidence) / (serviceCost + (entry.reversible ? 0 : 1));

  return {
    id,
    label: entry.label,
    applicable: addresses.length > 0,
    addresses,
    reduction,
    projectedScore: after.score,
    projectedSeverity: after.severity,
    leavesCritical: after.score >= CRITICAL_THRESHOLD,
    reversible: entry.reversible,
    serviceImpact: entry.serviceImpact,
    confidence: entry.confidence,
    /** Ranking value. Exposed so the interface can show the trade, not hide it. */
    value: Number(score.toFixed(2)),
  };
}

/**
 * Rank the responses worth considering.
 *
 * Inapplicable actions are **excluded, not demoted**. A recommendation list
 * that always has six entries trains an analyst to stop reading it.
 */
export function recommendResponses(context = {}, options = {}) {
  const limit = options.limit ?? 4;

  const evaluated = Object.keys(RESPONSE_CATALOG)
    .map((id) => evaluateResponse(id, context))
    .filter(Boolean)
    .filter((r) => r.applicable && r.reduction > 0)
    .sort((a, b) => b.value - a.value || b.reduction - a.reduction);

  const top = evaluated.slice(0, limit);

  return {
    recommendations: top,
    considered: Object.keys(RESPONSE_CATALOG).length,
    excluded: Object.keys(RESPONSE_CATALOG).length - evaluated.length,
    /**
     * Said in words, because a ranked list without a stated reason is an
     * oracle. The interface must be able to show *why* this one is first.
     */
    rationale: top.length > 0 ? explain(top[0], top[1]) : null,
  };
}

function explain(first, second) {
  const parts = [
    `${first.label} removes ${first.reduction} points`,
  ];

  if (first.reversible) parts.push('and can be undone');
  else parts.push('but cannot be undone');

  if (first.serviceImpact === 'low') parts.push('with little service disruption');
  if (first.serviceImpact === 'high') parts.push('at the cost of taking the service offline');

  if (second && second.reduction > first.reduction) {
    parts.push(
      `${second.label} would remove more (${second.reduction}) but costs more to take`
    );
  }

  if (first.leavesCritical) {
    parts.push('risk stays critical afterwards, so this is a first step, not a fix');
  }

  return `${parts.join(', ')}.`;
}

/**
 * Simulate a set of responses.
 *
 * Deliberately the same call as the live calculation, with the actions
 * appended. The result is marked `simulated` so no interface can present a
 * projection as an observation by accident.
 */
export function simulateResponses(context = {}, responseIds = []) {
  const ids = responseIds.filter((id) => RESPONSE_CATALOG[id]);
  const unknown = responseIds.filter((id) => !RESPONSE_CATALOG[id]);

  const before = computeRisk(context);
  const after = computeRisk({
    ...context,
    responses: [...(context.responses ?? []), ...ids.map((id) => ({ id }))],
  });

  const steps = [];
  let running = [...(context.responses ?? [])];
  ids.forEach((id) => {
    const priorScore = computeRisk({ ...context, responses: running }).score;
    running = [...running, { id }];
    const nextScore = computeRisk({ ...context, responses: running }).score;
    steps.push({
      id,
      label: RESPONSE_CATALOG[id].label,
      from: priorScore,
      to: nextScore,
      delta: nextScore - priorScore,
    });
  });

  return {
    simulated: true,
    before: { score: before.score, severity: before.severity },
    after: { score: after.score, severity: after.severity },
    delta: after.score - before.score,
    /**
     * Per-action attribution in the order applied. Reductions interact —
     * two actions that both lower likelihood do not simply add — so showing
     * a running total is the only honest way to present a combination.
     */
    steps,
    /** Actions that cannot be undone, named so the analyst sees them together. */
    irreversible: ids.filter((id) => !RESPONSE_CATALOG[id].reversible),
    /** Actions that take something offline. */
    disruptive: ids.filter((id) => RESPONSE_CATALOG[id].serviceImpact === 'high'),
    unknown,
    stillCritical: after.score >= CRITICAL_THRESHOLD,
    resolvedTo: severityOf(after.score),
  };
}

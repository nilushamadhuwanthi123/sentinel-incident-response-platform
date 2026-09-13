/**
 * Blast radius.
 *
 * "The auth service is compromised" is not an answer an incident commander
 * can act on. "Five services affected, two of them high-impact, three
 * customer-facing journeys broken, system risk 41 → 76" is.
 *
 * This engine turns a single failing or compromised node into that answer,
 * by walking the dependency graph and re-running the risk engine against
 * what the failure implies.
 *
 * Read-only by construction: calculating a blast radius must never change
 * the incident it is describing.
 */

import { computeRisk } from './riskEngine.js';
import {
  HEALTH,
  affectedWorkflows,
  dependentsOf,
  systemHealth,
} from './topology.js';

/**
 * How much accumulated dependency strength counts as "actually affected".
 *
 * Below this, a node technically sits downstream but would barely notice —
 * reporting it would inflate the number and teach the analyst to distrust
 * it.
 */
export const IMPACT_THRESHOLD = 0.3;

/** At or above this, a dependent is treated as losing its own service. */
export const HIGH_IMPACT_THRESHOLD = 0.8;

const CRITICALITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Project the health of a dependent, given how hard it leans on the failure.
 * A hard dependency on something offline is offline; a soft one degrades.
 */
function projectHealth(strength) {
  if (strength >= HIGH_IMPACT_THRESHOLD) return HEALTH.CRITICAL;
  if (strength >= 0.5) return HEALTH.DEGRADED;
  return HEALTH.DEGRADED;
}

/**
 * Risk signals implied by a failure of this shape.
 *
 * These are derived from what the topology already knows about the nodes
 * involved — not invented for the demo, and not duplicated from the risk
 * engine's own judgement of what each signal is worth.
 */
function impliedSignals(graph, originId, affected) {
  const origin = graph.node(originId);
  const signals = [];
  if (!origin) return signals;

  if (origin.internetFacing) signals.push('PUBLIC_FACING_SERVICE');
  if (origin.handlesIdentity) signals.push('PRIVILEGED_ACCOUNT');
  if (origin.sensitive) signals.push('SENSITIVE_RESOURCE_ACCESS');

  const touchesDatastore = [origin, ...affected.map((a) => graph.node(a.id))]
    .filter(Boolean)
    .some((n) => n.kind === 'datastore');
  if (touchesDatastore) signals.push('DATA_STORE_REACHED');

  if (affected.length >= 3) signals.push('MULTI_SERVICE_SPREAD');

  return signals;
}

/**
 * Calculate the blast radius of a node failing or being compromised.
 *
 * @param {object} graph          from buildGraph()
 * @param {object} options
 * @param {string} options.originId
 * @param {object} [options.healthById]   current health, for before/after
 * @param {object} [options.riskContext]  the live incident's risk input
 * @param {number} [options.threshold]    minimum strength to count as affected
 */
export function computeBlastRadius(graph, options = {}) {
  const { originId, healthById = {}, riskContext = {} } = options;
  const threshold = options.threshold ?? IMPACT_THRESHOLD;

  const origin = graph?.node?.(originId) ?? null;
  if (!origin) {
    return {
      origin: null,
      found: false,
      affected: [],
      highImpact: [],
      workflows: [],
      counts: { affected: 0, highImpact: 0, workflows: 0 },
      health: { before: 100, after: 100, delta: 0 },
      risk: { before: 0, after: 0, delta: 0, addedSignals: [] },
    };
  }

  const reached = dependentsOf(graph, originId);

  const affected = reached
    .filter((r) => r.strength >= threshold)
    .map((r) => {
      const node = graph.node(r.id);
      return {
        id: r.id,
        label: node?.label ?? r.id,
        kind: node?.kind ?? null,
        criticality: node?.criticality ?? 'medium',
        depth: r.depth,
        strength: Number(r.strength.toFixed(3)),
        via: r.via,
        path: r.path,
        projectedHealth: projectHealth(r.strength),
        highImpact: r.strength >= HIGH_IMPACT_THRESHOLD,
      };
    })
    .sort(
      (a, b) =>
        b.strength - a.strength ||
        (CRITICALITY_RANK[b.criticality] ?? 2) -
          (CRITICALITY_RANK[a.criticality] ?? 2)
    );

  const highImpact = affected.filter((a) => a.highImpact);

  // Only nodes that actually lose their own service break a journey. A
  // degraded dependent still serves, and saying checkout is down when it is
  // merely slower would be the kind of false alarm that gets a tool ignored.
  const unavailable = [originId, ...highImpact.map((a) => a.id)];
  const workflows = affectedWorkflows(graph, unavailable);

  const healthBefore = systemHealth(graph, healthById);
  const projectedHealthMap = { ...healthById, [originId]: HEALTH.OFFLINE };
  affected.forEach((a) => {
    projectedHealthMap[a.id] = a.projectedHealth;
  });
  const healthAfter = systemHealth(graph, projectedHealthMap);

  // Risk is re-run through the same engine, with the signals this failure
  // implies added. Nothing here decides what a signal is worth.
  const addedSignals = impliedSignals(graph, originId, affected);
  const riskBefore = computeRisk(riskContext);
  const riskAfter = computeRisk({
    ...riskContext,
    signals: [...(riskContext.signals ?? []), ...addedSignals],
  });

  return {
    origin: {
      id: origin.id,
      label: origin.label ?? origin.id,
      kind: origin.kind ?? null,
      criticality: origin.criticality ?? 'medium',
    },
    found: true,
    affected,
    highImpact,
    workflows,
    counts: {
      affected: affected.length,
      highImpact: highImpact.length,
      workflows: workflows.length,
    },
    health: {
      before: healthBefore.score,
      after: healthAfter.score,
      delta: healthAfter.score - healthBefore.score,
    },
    risk: {
      before: riskBefore.score,
      after: riskAfter.score,
      delta: riskAfter.score - riskBefore.score,
      beforeSeverity: riskBefore.severity,
      afterSeverity: riskAfter.severity,
      addedSignals,
    },
    /** Node ids the topology should highlight. */
    highlight: [originId, ...affected.map((a) => a.id)],
  };
}

/**
 * Failure simulation: the same calculation, presented as a hypothetical.
 *
 * It is deliberately the same code path. A simulator that computes impact
 * differently from the real thing is a simulator that lies, and the whole
 * point of showing a projection is that the analyst can trust it.
 */
export function simulateFailure(graph, options = {}) {
  const result = computeBlastRadius(graph, options);
  return {
    ...result,
    simulated: true,
    summary: result.found
      ? {
          headline: `${result.origin.label} failure`,
          services: `${result.counts.affected} service${
            result.counts.affected === 1 ? '' : 's'
          } affected`,
          highImpact: `${result.counts.highImpact} high-impact`,
          workflows: `${result.counts.workflows} user-facing workflow${
            result.counts.workflows === 1 ? '' : 's'
          } unavailable`,
          health: `Health ${result.health.before} → ${result.health.after}`,
          risk: `Risk ${result.risk.before} → ${result.risk.after}`,
        }
      : null,
  };
}

/**
 * Rank every node by how much damage its failure would cause.
 *
 * This is what the attack-surface panel orders by: not "how likely is this
 * to break" — the platform cannot know that — but "how much would it cost
 * if it did", which the dependency graph genuinely does know.
 */
export function rankByImpact(graph, options = {}) {
  return graph
    .list()
    .filter((n) => !n.external)
    .map((node) => {
      const radius = computeBlastRadius(graph, {
        ...options,
        originId: node.id,
      });
      return {
        id: node.id,
        label: node.label ?? node.id,
        kind: node.kind ?? null,
        criticality: node.criticality ?? 'medium',
        internetFacing: Boolean(node.internetFacing),
        sensitive: Boolean(node.sensitive),
        affected: radius.counts.affected,
        highImpact: radius.counts.highImpact,
        workflows: radius.counts.workflows,
        healthCost: -radius.health.delta,
      };
    })
    .sort(
      (a, b) =>
        b.workflows - a.workflows ||
        b.highImpact - a.highImpact ||
        b.healthCost - a.healthCost
    );
}

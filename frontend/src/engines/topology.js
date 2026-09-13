/**
 * The infrastructure dependency graph.
 *
 * Everything that needs to answer "what else does this affect" reads from
 * here: the topology view, the blast radius calculation, the failure
 * simulator and the risk contribution of a degraded service. Keeping one
 * graph — rather than one per feature — is what stops the topology drawing
 * an edge that the impact calculation does not know about.
 *
 * Traversal is cycle-safe. Real infrastructure has circular dependencies
 * (an auth service that calls an API that calls auth), and a traversal that
 * assumes otherwise does not return a wrong answer — it hangs the browser.
 *
 * Pure module: no React, no DOM, no network, no reads of live state.
 */

export const NODE_KINDS = Object.freeze({
  BOUNDARY: 'boundary',
  GATEWAY: 'gateway',
  SERVICE: 'service',
  DATASTORE: 'datastore',
});

export const HEALTH = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  OFFLINE: 'OFFLINE',
});

/** Ordered worst-last, so severity comparisons are a simple index lookup. */
const HEALTH_ORDER = [
  HEALTH.HEALTHY,
  HEALTH.DEGRADED,
  HEALTH.CRITICAL,
  HEALTH.OFFLINE,
];

/**
 * How much of a node's unavailability propagates to something that depends
 * on it. A service that cannot reach its database is in serious trouble; a
 * service that cannot send notifications usually is not. Modelling that as
 * a per-edge weight is what stops the blast radius treating every
 * dependency as fatal.
 */
export const DEPENDENCY_STRENGTH = Object.freeze({
  hard: 1, // cannot function without it
  soft: 0.45, // degrades, keeps serving
  optional: 0.15, // barely noticed
});

/**
 * The reference topology.
 *
 * `dependsOn` points at what a node needs in order to work. Impact
 * therefore flows in the opposite direction: if A depends on B, then B
 * failing affects A.
 */
export const DEFAULT_TOPOLOGY = Object.freeze({
  nodes: [
    { id: 'internet', label: 'Internet', kind: NODE_KINDS.BOUNDARY, external: true, dependsOn: [] },
    { id: 'edge-gateway', label: 'Edge Gateway', kind: NODE_KINDS.GATEWAY, internetFacing: true, dependsOn: [{ id: 'internet', strength: 'hard' }] },
    { id: 'api-gateway', label: 'API Gateway', kind: NODE_KINDS.GATEWAY, internetFacing: true, dependsOn: [{ id: 'edge-gateway', strength: 'hard' }] },
    { id: 'auth', label: 'Auth Service', kind: NODE_KINDS.SERVICE, criticality: 'high', handlesIdentity: true, dependsOn: [{ id: 'api-gateway', strength: 'hard' }, { id: 'database', strength: 'hard' }] },
    { id: 'core-api', label: 'Core API', kind: NODE_KINDS.SERVICE, criticality: 'high', dependsOn: [{ id: 'api-gateway', strength: 'hard' }, { id: 'auth', strength: 'hard' }, { id: 'database', strength: 'hard' }] },
    { id: 'payment', label: 'Payment Service', kind: NODE_KINDS.SERVICE, criticality: 'high', sensitive: true, dependsOn: [{ id: 'api-gateway', strength: 'hard' }, { id: 'auth', strength: 'hard' }, { id: 'database', strength: 'hard' }] },
    { id: 'notification', label: 'Notification Service', kind: NODE_KINDS.SERVICE, criticality: 'low', dependsOn: [{ id: 'api-gateway', strength: 'hard' }, { id: 'auth', strength: 'soft' }] },
    { id: 'storage', label: 'Storage Service', kind: NODE_KINDS.SERVICE, criticality: 'medium', dependsOn: [{ id: 'api-gateway', strength: 'hard' }, { id: 'auth', strength: 'soft' }] },
    { id: 'database', label: 'Database', kind: NODE_KINDS.DATASTORE, criticality: 'critical', sensitive: true, dependsOn: [] },
  ],
  /**
   * User-facing journeys, and the nodes each one needs. Without these the
   * blast radius can only report "five services affected", which does not
   * tell an incident commander whether customers noticed.
   */
  workflows: [
    { id: 'sign-in', label: 'Sign in', requires: ['edge-gateway', 'api-gateway', 'auth', 'database'] },
    { id: 'checkout', label: 'Checkout', requires: ['edge-gateway', 'api-gateway', 'auth', 'payment', 'database'] },
    { id: 'upload', label: 'Upload a file', requires: ['edge-gateway', 'api-gateway', 'storage'] },
    { id: 'notify', label: 'Receive notifications', requires: ['notification'] },
  ],
});

/**
 * Index a topology for traversal.
 *
 * Builds both directions once — dependencies (what a node needs) and
 * dependents (what needs it) — because every interesting question asks one
 * or the other, and deriving the reverse edges on each call is how a graph
 * this size still manages to be slow.
 */
export function buildGraph(topology = DEFAULT_TOPOLOGY) {
  const nodes = new Map();
  const dependencies = new Map();
  const dependents = new Map();

  (topology.nodes ?? []).forEach((node) => {
    nodes.set(node.id, node);
    dependencies.set(node.id, []);
    if (!dependents.has(node.id)) dependents.set(node.id, []);
  });

  (topology.nodes ?? []).forEach((node) => {
    (node.dependsOn ?? []).forEach((dep) => {
      const depId = typeof dep === 'string' ? dep : dep.id;
      const strength = typeof dep === 'string' ? 'hard' : dep.strength ?? 'hard';
      // An edge to a node that does not exist is a data error, not
      // something to invent a node for.
      if (!nodes.has(depId)) return;
      dependencies.get(node.id).push({ id: depId, strength });
      if (!dependents.has(depId)) dependents.set(depId, []);
      dependents.get(depId).push({ id: node.id, strength });
    });
  });

  return {
    nodes,
    dependencies,
    dependents,
    workflows: topology.workflows ?? [],
    list: () => [...nodes.values()],
    node: (id) => nodes.get(id) ?? null,
    dependenciesOf: (id) => dependencies.get(id) ?? [],
    dependentsOf: (id) => dependents.get(id) ?? [],
  };
}

/**
 * Walk the graph from a starting node, in either direction.
 *
 * Returns each reached node with its distance and the accumulated
 * dependency strength along the path. The `seen` set is what makes this
 * cycle-safe: without it, auth → core-api → auth loops until the tab dies.
 *
 * @param {object} graph
 * @param {string} startId
 * @param {object} [options]
 * @param {'dependents'|'dependencies'} [options.direction]
 * @param {number} [options.maxDepth]
 */
export function traverse(graph, startId, options = {}) {
  const direction = options.direction ?? 'dependents';
  const maxDepth = options.maxDepth ?? Infinity;
  if (!graph?.nodes?.has(startId)) return [];

  const edgesOf =
    direction === 'dependents'
      ? (id) => graph.dependentsOf(id)
      : (id) => graph.dependenciesOf(id);

  const seen = new Set([startId]);
  const reached = [];
  let frontier = [{ id: startId, depth: 0, strength: 1, path: [startId] }];

  while (frontier.length > 0) {
    const next = [];
    frontier.forEach((current) => {
      if (current.depth >= maxDepth) return;
      edgesOf(current.id).forEach((edge) => {
        if (seen.has(edge.id)) return;
        seen.add(edge.id);
        const entry = {
          id: edge.id,
          depth: current.depth + 1,
          // Strength attenuates along the path: something that softly
          // depends on something that softly depends on the failure is
          // barely affected, and should not be reported as if it were.
          strength:
            current.strength * (DEPENDENCY_STRENGTH[edge.strength] ?? 1),
          via: current.id,
          path: [...current.path, edge.id],
        };
        reached.push(entry);
        next.push(entry);
      });
    });
    frontier = next;
  }

  return reached.sort((a, b) => a.depth - b.depth || b.strength - a.strength);
}

/** Everything that would be affected if this node failed. */
export const dependentsOf = (graph, id, options) =>
  traverse(graph, id, { ...options, direction: 'dependents' });

/** Everything this node needs in order to work. */
export const dependenciesOf = (graph, id, options) =>
  traverse(graph, id, { ...options, direction: 'dependencies' });

/** The worse of two health states. */
export function worstHealth(a, b) {
  const ai = HEALTH_ORDER.indexOf(a);
  const bi = HEALTH_ORDER.indexOf(b);
  if (ai === -1) return b;
  if (bi === -1) return a;
  return HEALTH_ORDER[Math.max(ai, bi)];
}

/** True when `candidate` is at least as bad as `threshold`. */
export function isAtLeast(candidate, threshold) {
  return (
    HEALTH_ORDER.indexOf(candidate) >= HEALTH_ORDER.indexOf(threshold) &&
    HEALTH_ORDER.indexOf(candidate) !== -1
  );
}

/**
 * Which user-facing workflows are broken, given a set of unavailable nodes.
 * "Five services affected" does not tell an incident commander whether
 * customers noticed; this does.
 */
export function affectedWorkflows(graph, unavailableIds) {
  const down = new Set(unavailableIds);
  return (graph.workflows ?? [])
    .map((w) => {
      const broken = w.requires.filter((id) => down.has(id));
      return broken.length > 0
        ? { id: w.id, label: w.label, brokenBy: broken }
        : null;
    })
    .filter(Boolean);
}

/**
 * Overall system health as a 0-100 score.
 *
 * Weighted by criticality, because a degraded notification service and a
 * degraded database are not the same event, and an average that says they
 * are is worse than no score at all.
 */
const CRITICALITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
const HEALTH_PENALTY = {
  [HEALTH.HEALTHY]: 0,
  [HEALTH.DEGRADED]: 0.35,
  [HEALTH.CRITICAL]: 0.75,
  [HEALTH.OFFLINE]: 1,
};

export function systemHealth(graph, healthById = {}) {
  const nodes = graph.list().filter((n) => !n.external);
  if (nodes.length === 0) return { score: 100, worst: HEALTH.HEALTHY, counts: {} };

  let weighted = 0;
  let total = 0;
  const counts = {
    [HEALTH.HEALTHY]: 0,
    [HEALTH.DEGRADED]: 0,
    [HEALTH.CRITICAL]: 0,
    [HEALTH.OFFLINE]: 0,
  };
  let worst = HEALTH.HEALTHY;

  nodes.forEach((node) => {
    const health = healthById[node.id] ?? HEALTH.HEALTHY;
    const weight = CRITICALITY_WEIGHT[node.criticality] ?? 2;
    counts[health] = (counts[health] ?? 0) + 1;
    worst = worstHealth(worst, health);
    weighted += (HEALTH_PENALTY[health] ?? 0) * weight;
    total += weight;
  });

  return {
    score: Math.round(100 - (weighted / total) * 100),
    worst,
    counts,
  };
}

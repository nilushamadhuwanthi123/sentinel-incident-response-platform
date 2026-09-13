/**
 * Infrastructure topology with blast-radius simulation.
 *
 * This is the view that turns "auth is compromised" into "sign-in and
 * checkout are down, system health falls from 100 to 57, and risk rises
 * from 17 to 52". An analyst cannot reason about impact from a service
 * list; they can from a dependency graph.
 *
 * **Layout is by tier, not by force.** A force-directed graph rearranges
 * itself every render, so the picture an operator learned yesterday is not
 * the picture they see today. Depth from the internet boundary is a real
 * property of the estate, so it is what positions the nodes — and the
 * layout is therefore identical on every load, for everyone.
 *
 * **The simulation is the same code path as the real calculation.** A
 * what-if that computes impact differently from the live view is a what-if
 * that lies, and the entire value of a projection is that it can be
 * trusted.
 */

import { useMemo, useState } from 'react';
import { DEFAULT_TOPOLOGY, HEALTH, buildGraph, systemHealth } from '../../engines/topology.js';
import { simulateFailure, rankByImpact } from '../../engines/blastRadius.js';

/**
 * The wire format uses operational vocabulary; the graph uses health
 * vocabulary. Translating in one named place beats each component guessing:
 * an unmapped status would silently score as healthy, which is the most
 * dangerous default a health calculation can have.
 */
const HEALTH_OF = Object.freeze({
  operational: HEALTH.HEALTHY,
  degraded: HEALTH.DEGRADED,
  compromised: HEALTH.CRITICAL,
  offline: HEALTH.OFFLINE,
});

const WIDTH = 720;
const HEIGHT = 380;
const MARGIN = 60;

/**
 * Tier a node by how far it sits from the internet boundary.
 *
 * Derived from the graph, so a service added to the topology is placed
 * without anyone editing a coordinate table — the failure mode of every
 * hand-positioned diagram.
 */
function layout(graph) {
  const nodes = graph.list();
  const depthOf = new Map();

  const resolve = (node, seen = new Set()) => {
    if (depthOf.has(node.id)) return depthOf.get(node.id);
    if (seen.has(node.id)) return 0; // cycle guard
    seen.add(node.id);
    const deps = (node.dependsOn ?? []).map((d) => graph.node(d.id)).filter(Boolean);
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => resolve(d, seen)));
    depthOf.set(node.id, depth);
    return depth;
  };

  nodes.forEach((n) => resolve(n));

  const tiers = new Map();
  nodes.forEach((n) => {
    const d = depthOf.get(n.id) ?? 0;
    if (!tiers.has(d)) tiers.set(d, []);
    tiers.get(d).push(n);
  });

  const maxDepth = Math.max(...tiers.keys());
  const positioned = new Map();

  [...tiers.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([depth, group]) => {
      const x =
        maxDepth === 0
          ? WIDTH / 2
          : MARGIN + (depth / maxDepth) * (WIDTH - MARGIN * 2);
      group
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((node, i) => {
          const step = (HEIGHT - MARGIN * 2) / Math.max(1, group.length - 1 || 1);
          const y =
            group.length === 1 ? HEIGHT / 2 : MARGIN + i * step;
          positioned.set(node.id, { x, y, node, depth });
        });
    });

  return positioned;
}

export function InfrastructureMap({ services = {} }) {
  const [selectedId, setSelectedId] = useState(null);

  const graph = useMemo(() => buildGraph(DEFAULT_TOPOLOGY), []);
  const positions = useMemo(() => layout(graph), [graph]);

  // Two derived maps, deliberately not one. The wire status is what the
  // node is drawn as; the health constant is what the graph calculates
  // with. Collapsing them would mean either the CSS class or the health
  // score silently reading a vocabulary it does not speak.
  const statusById = useMemo(() => {
    const out = {};
    Object.entries(services).forEach(([id, state]) => {
      if (state?.status) out[id] = state.status;
    });
    return out;
  }, [services]);

  const healthById = useMemo(() => {
    const out = {};
    Object.entries(statusById).forEach(([id, status]) => {
      const mapped = HEALTH_OF[status];
      if (mapped) out[id] = mapped;
    });
    return out;
  }, [statusById]);

  const health = useMemo(
    () => systemHealth(graph, healthById),
    [graph, healthById]
  );

  const projection = useMemo(
    () =>
      selectedId
        ? simulateFailure(graph, { originId: selectedId, healthById })
        : null,
    [graph, selectedId, healthById]
  );

  const ranked = useMemo(
    () => rankByImpact(graph, { healthById }).slice(0, 5),
    [graph, healthById]
  );

  const highlighted = new Set(projection?.highlight ?? []);

  return (
    <div className="topo">
      <div className="topo-map">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={
            projection?.summary
              ? `${projection.summary.headline}: ${projection.summary.services}, ${projection.summary.workflows}.`
              : `Infrastructure dependency graph, ${positions.size} services, system health ${health.score} of 100.`
          }
        >
          {[...positions.values()].map(({ x, y, node }) =>
            (node.dependsOn ?? []).map((dep) => {
              const from = positions.get(dep.id);
              if (!from) return null;
              const inBlast =
                highlighted.has(node.id) && highlighted.has(dep.id);
              return (
                <line
                  key={`${node.id}-${dep.id}`}
                  className={`topo-edge topo-edge--${dep.strength ?? 'hard'} ${
                    inBlast ? 'is-blast' : ''
                  }`}
                  x1={from.x}
                  y1={from.y}
                  x2={x}
                  y2={y}
                />
              );
            })
          )}

          {[...positions.values()].map(({ x, y, node }) => {
            const status = statusById[node.id] ?? 'operational';
            const inBlast = highlighted.has(node.id);
            const isOrigin = node.id === selectedId;
            return (
              <g
                key={node.id}
                className={`topo-node topo-node--${status} ${
                  inBlast ? 'is-blast' : ''
                } ${isOrigin ? 'is-origin' : ''}`}
                onClick={() => setSelectedId(isOrigin ? null : node.id)}
              >
                <rect
                  x={x - 46}
                  y={y - 15}
                  width="92"
                  height="30"
                  rx="4"
                  className="topo-node-box"
                />
                <text x={x} y={y + 4} textAnchor="middle" className="topo-node-label">
                  {node.label ?? node.id}
                </text>
              </g>
            );
          })}
        </svg>

        <p className="topo-hint">
          Select a service to project what its failure would cost. The
          projection runs the same calculation as the live view — a what-if
          that computes impact differently from the real thing is a what-if
          that lies.
        </p>
      </div>

      <div className="topo-side">
        <div className="topo-health">
          <span className="topo-health-label">System health</span>
          <span className="topo-health-score">{health.score}</span>
          {projection?.found && (
            <span className="topo-health-after">
              → {projection.health.after}
            </span>
          )}
        </div>

        {projection?.found ? (
          <div className="topo-projection">
            <h3 className="topo-projection-title">
              {projection.summary.headline}
              <span className="topo-sim-tag">projected</span>
            </h3>
            <ul className="topo-projection-list">
              <li>{projection.summary.services}</li>
              <li>{projection.summary.highImpact}</li>
              <li>{projection.summary.workflows}</li>
              <li>{projection.summary.health}</li>
              <li>{projection.summary.risk}</li>
            </ul>

            {projection.workflows.length > 0 && (
              <>
                <h4 className="topo-sub">Workflows that stop working</h4>
                <ul className="topo-workflows">
                  {projection.workflows.map((w) => (
                    <li key={w.id}>{w.label}</li>
                  ))}
                </ul>
              </>
            )}

            <button
              type="button"
              className="topo-clear"
              onClick={() => setSelectedId(null)}
            >
              Clear projection
            </button>
          </div>
        ) : (
          <div className="topo-rank">
            <h3 className="topo-sub">Ranked by cost of failure</h3>
            <p className="topo-rank-note">
              Not how likely a service is to break — the platform cannot know
              that. How much it would cost if it did, which the dependency
              graph genuinely does know.
            </p>
            <ol className="topo-rank-list">
              {ranked.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className="topo-rank-button"
                    onClick={() => setSelectedId(node.id)}
                  >
                    <span className="topo-rank-name">{node.label}</span>
                    <span className="topo-rank-meta">
                      {node.affected} affected · {node.workflows} workflows
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

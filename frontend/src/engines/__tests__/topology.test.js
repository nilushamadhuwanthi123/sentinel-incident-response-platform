import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOPOLOGY,
  HEALTH,
  affectedWorkflows,
  buildGraph,
  dependenciesOf,
  dependentsOf,
  isAtLeast,
  systemHealth,
  traverse,
  worstHealth,
} from '../topology.js';

const graph = () => buildGraph();

describe('buildGraph', () => {
  it('indexes every node', () => {
    const g = graph();
    expect(g.list()).toHaveLength(DEFAULT_TOPOLOGY.nodes.length);
    expect(g.node('auth').label).toBe('Auth Service');
    expect(g.node('nope')).toBeNull();
  });

  it('builds both directions of every edge', () => {
    const g = graph();
    // core-api depends on auth, so auth is depended on by core-api.
    expect(g.dependenciesOf('core-api').map((d) => d.id)).toContain('auth');
    expect(g.dependentsOf('auth').map((d) => d.id)).toContain('core-api');
  });

  it('ignores an edge to a node that does not exist', () => {
    const g = buildGraph({
      nodes: [
        { id: 'a', dependsOn: [{ id: 'ghost', strength: 'hard' }] },
        { id: 'b', dependsOn: ['a'] },
      ],
    });
    expect(g.dependenciesOf('a')).toEqual([]);
    expect(g.dependentsOf('a').map((d) => d.id)).toEqual(['b']);
  });

  it('accepts a bare string dependency and treats it as hard', () => {
    const g = buildGraph({ nodes: [{ id: 'a' }, { id: 'b', dependsOn: ['a'] }] });
    expect(g.dependenciesOf('b')).toEqual([{ id: 'a', strength: 'hard' }]);
  });

  it('handles an empty topology', () => {
    const g = buildGraph({ nodes: [] });
    expect(g.list()).toEqual([]);
    expect(g.dependentsOf('anything')).toEqual([]);
  });
});

describe('traverse', () => {
  it('finds everything downstream of a failure', () => {
    const reached = dependentsOf(graph(), 'auth').map((r) => r.id);
    expect(reached).toEqual(
      expect.arrayContaining(['core-api', 'payment', 'notification', 'storage'])
    );
  });

  it('finds everything a node needs', () => {
    const reached = dependenciesOf(graph(), 'payment').map((r) => r.id);
    expect(reached).toEqual(
      expect.arrayContaining(['api-gateway', 'auth', 'database', 'edge-gateway'])
    );
  });

  it('reports depth from the origin', () => {
    const byId = Object.fromEntries(
      dependentsOf(graph(), 'database').map((r) => [r.id, r.depth])
    );
    expect(byId.auth).toBe(1);
    // core-api depends on the database directly as well, so it is also depth 1.
    expect(byId['core-api']).toBe(1);
    expect(byId.notification).toBe(2);
  });

  it('attenuates strength along the path', () => {
    const reached = dependentsOf(graph(), 'auth');
    const hard = reached.find((r) => r.id === 'core-api');
    const soft = reached.find((r) => r.id === 'notification');
    expect(hard.strength).toBe(1);
    expect(soft.strength).toBeLessThan(1);
  });

  it('records the path taken', () => {
    const notification = dependentsOf(graph(), 'database').find(
      (r) => r.id === 'notification'
    );
    expect(notification.path[0]).toBe('database');
    expect(notification.path.at(-1)).toBe('notification');
  });

  it('respects maxDepth', () => {
    const shallow = dependentsOf(graph(), 'database', { maxDepth: 1 });
    expect(shallow.every((r) => r.depth <= 1)).toBe(true);
    expect(shallow.map((r) => r.id)).not.toContain('notification');
  });

  it('terminates on a cyclic graph instead of hanging', () => {
    // Real infrastructure has cycles: auth calls api, api calls auth.
    const cyclic = buildGraph({
      nodes: [
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['c'] },
        { id: 'c', dependsOn: ['a'] },
      ],
    });
    const reached = dependentsOf(cyclic, 'a').map((r) => r.id);
    expect(reached.sort()).toEqual(['b', 'c']);
  });

  it('visits each node once, even when several paths reach it', () => {
    const reached = dependentsOf(graph(), 'database');
    const ids = reached.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never includes the starting node in its own results', () => {
    expect(dependentsOf(graph(), 'auth').map((r) => r.id)).not.toContain('auth');
  });

  it('returns nothing for an unknown node', () => {
    expect(traverse(graph(), 'does-not-exist')).toEqual([]);
  });

  it('returns nothing for a leaf with no dependents', () => {
    expect(dependentsOf(graph(), 'payment')).toEqual([]);
  });
});

describe('health comparison', () => {
  it('picks the worse of two states', () => {
    expect(worstHealth(HEALTH.HEALTHY, HEALTH.DEGRADED)).toBe(HEALTH.DEGRADED);
    expect(worstHealth(HEALTH.OFFLINE, HEALTH.CRITICAL)).toBe(HEALTH.OFFLINE);
    expect(worstHealth(HEALTH.HEALTHY, HEALTH.HEALTHY)).toBe(HEALTH.HEALTHY);
  });

  it('tolerates an unknown state rather than returning undefined', () => {
    expect(worstHealth('NONSENSE', HEALTH.DEGRADED)).toBe(HEALTH.DEGRADED);
  });

  it('compares against a threshold', () => {
    expect(isAtLeast(HEALTH.CRITICAL, HEALTH.DEGRADED)).toBe(true);
    expect(isAtLeast(HEALTH.HEALTHY, HEALTH.DEGRADED)).toBe(false);
    expect(isAtLeast(HEALTH.DEGRADED, HEALTH.DEGRADED)).toBe(true);
  });
});

describe('affectedWorkflows', () => {
  it('reports which user journeys break', () => {
    const broken = affectedWorkflows(graph(), ['payment']);
    expect(broken.map((w) => w.id)).toEqual(['checkout']);
    expect(broken[0].brokenBy).toEqual(['payment']);
  });

  it('reports nothing when nothing relevant is down', () => {
    expect(affectedWorkflows(graph(), [])).toEqual([]);
  });

  it('names every unavailable node that breaks a journey', () => {
    const [checkout] = affectedWorkflows(graph(), ['auth', 'payment']).filter(
      (w) => w.id === 'checkout'
    );
    expect(checkout.brokenBy).toEqual(expect.arrayContaining(['auth', 'payment']));
  });
});

describe('systemHealth', () => {
  it('is 100 when everything is healthy', () => {
    expect(systemHealth(graph(), {}).score).toBe(100);
  });

  it('falls as services degrade', () => {
    const healthy = systemHealth(graph(), {}).score;
    const degraded = systemHealth(graph(), { auth: HEALTH.DEGRADED }).score;
    const offline = systemHealth(graph(), { auth: HEALTH.OFFLINE }).score;
    expect(degraded).toBeLessThan(healthy);
    expect(offline).toBeLessThan(degraded);
  });

  it('weights a critical datastore above a low-criticality service', () => {
    const db = systemHealth(graph(), { database: HEALTH.OFFLINE }).score;
    const notif = systemHealth(graph(), { notification: HEALTH.OFFLINE }).score;
    expect(db).toBeLessThan(notif);
  });

  it('reports the worst state and a count of each', () => {
    const result = systemHealth(graph(), {
      auth: HEALTH.OFFLINE,
      'core-api': HEALTH.CRITICAL,
    });
    expect(result.worst).toBe(HEALTH.OFFLINE);
    expect(result.counts[HEALTH.OFFLINE]).toBe(1);
    expect(result.counts[HEALTH.CRITICAL]).toBe(1);
  });

  it('excludes the external boundary from the score', () => {
    // "The internet" is not something we operate, so its state must not
    // move our health score.
    const withInternet = systemHealth(graph(), { internet: HEALTH.OFFLINE });
    expect(withInternet.score).toBe(100);
  });

  it('stays within 0-100 even when everything is offline', () => {
    const allOffline = Object.fromEntries(
      graph().list().map((n) => [n.id, HEALTH.OFFLINE])
    );
    const result = systemHealth(graph(), allOffline);
    expect(result.score).toBe(0);
  });

  it('handles an empty graph', () => {
    expect(systemHealth(buildGraph({ nodes: [] }), {}).score).toBe(100);
  });
});

describe('purity', () => {
  it('does not mutate the topology it was given', () => {
    const snapshot = JSON.parse(JSON.stringify(DEFAULT_TOPOLOGY));
    const g = buildGraph(DEFAULT_TOPOLOGY);
    dependentsOf(g, 'auth');
    systemHealth(g, { auth: HEALTH.OFFLINE });
    expect(DEFAULT_TOPOLOGY).toEqual(snapshot);
  });
});

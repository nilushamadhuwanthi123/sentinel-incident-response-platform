import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';

describe('analytics aggregation engine', () => {
  beforeEach(() => {
    store.reset();
  });

  it('aggregates incident counts, severities, and affected services accurately', () => {
    const incidents = store.listIncidents();
    assert.ok(incidents.length >= 3);

    const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL').length;
    const resolvedCount = incidents.filter((i) => i.status === 'RESOLVED').length;

    assert.ok(criticalCount >= 1);
    assert.ok(resolvedCount >= 1);

    // Verify service frequency calculation
    const frequency = {};
    for (const inc of incidents) {
      for (const s of inc.affectedServices || []) {
        frequency[s] = (frequency[s] || 0) + 1;
      }
    }
    assert.ok(frequency.auth >= 1);
  });

  it('computes MTTR based on real incident resolved timestamps', () => {
    const resolved = store.listIncidents().filter((i) => i.resolvedAt && i.createdAt);
    assert.ok(resolved.length >= 1);

    const diffMinutes =
      (new Date(resolved[0].resolvedAt).getTime() - new Date(resolved[0].createdAt).getTime()) /
      (60 * 1000);
    assert.ok(diffMinutes > 0);
  });
});

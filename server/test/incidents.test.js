import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';
import {
  isValidTransition,
  severityToRiskScore,
} from '../src/services/incidentLifecycle.js';

describe('incident lifecycle state machine', () => {
  it('validates allowed forward and defensive transitions', () => {
    assert.equal(isValidTransition('DETECTED', 'TRIAGED'), true);
    assert.equal(isValidTransition('TRIAGED', 'INVESTIGATING'), true);
    assert.equal(isValidTransition('INVESTIGATING', 'CONTAINED'), true);
    assert.equal(isValidTransition('CONTAINED', 'RESOLVED'), true);
    assert.equal(isValidTransition('RESOLVED', 'CLOSED'), true);
  });

  it('rejects jumping lifecycle steps', () => {
    // Cannot jump straight from DETECTED to RESOLVED without containment/investigation
    assert.equal(isValidTransition('DETECTED', 'RESOLVED'), false);
    // Cannot close directly from INVESTIGATING without containment/resolution
    assert.equal(isValidTransition('INVESTIGATING', 'CLOSED'), false);
  });

  it('permits reopening incidents from RESOLVED or CLOSED', () => {
    assert.equal(isValidTransition('RESOLVED', 'INVESTIGATING'), true);
    assert.equal(isValidTransition('CLOSED', 'INVESTIGATING'), true);
  });

  it('calculates risk score baselines according to severity scale', () => {
    assert.equal(severityToRiskScore('CRITICAL'), 90);
    assert.equal(severityToRiskScore('HIGH'), 70);
    assert.equal(severityToRiskScore('MEDIUM'), 45);
    assert.equal(severityToRiskScore('LOW'), 20);
    assert.equal(severityToRiskScore('INFO'), 10);
  });
});

describe('incident store & queries', () => {
  beforeEach(() => {
    store.reset();
  });

  it('lists seeded incidents and filters by status and severity', () => {
    const all = store.listIncidents();
    assert.ok(all.length >= 3);

    const criticals = store.listIncidents({ severity: 'CRITICAL' });
    assert.ok(criticals.every((i) => i.severity === 'CRITICAL'));

    const investigating = store.listIncidents({ status: 'INVESTIGATING' });
    assert.ok(investigating.every((i) => i.status === 'INVESTIGATING'));
  });

  it('creates incident and generates initial timeline entry', () => {
    const inc = store.createIncident({
      title: 'Suspicious Lateral Port Scan',
      summary: 'Port scan originating from billing pod',
      category: 'NETWORK_ATTACK',
      severity: 'HIGH',
      creator: 'Analyst Jane',
    });

    assert.ok(inc.id.startsWith('INC-2026-'));
    assert.equal(inc.status, 'DETECTED');
    assert.equal(inc.severity, 'HIGH');
    assert.ok(inc.timeline.length >= 1);
    assert.equal(inc.timeline[0].action, 'DETECTED');
    assert.equal(inc.timeline[0].actor, 'Analyst Jane');

    const fetched = store.getIncidentById(inc.id);
    assert.equal(fetched.title, 'Suspicious Lateral Port Scan');
  });

  it('updates incident lifecycle and appends audit timeline', () => {
    const inc = store.getIncidentById('INC-2026-089');
    assert.equal(inc.status, 'INVESTIGATING');

    const updated = store.updateIncident(
      inc.id,
      { status: 'CONTAINED', notes: 'Attacker IP blocked at border proxy' },
      { name: 'Kavindu Maduhansa' }
    );

    assert.equal(updated.status, 'CONTAINED');
    const lastTimeline = updated.timeline[updated.timeline.length - 1];
    assert.equal(lastTimeline.action, 'CONTAINED');
    assert.equal(lastTimeline.actor, 'Kavindu Maduhansa');
    assert.ok(lastTimeline.notes.includes('blocked at border proxy'));
  });

  it('supports searching incidents by title, summary, or ID', () => {
    const matches = store.listIncidents({ search: 'credential' });
    assert.ok(matches.length >= 1);
    assert.ok(matches[0].title.toLowerCase().includes('credential'));
  });
});

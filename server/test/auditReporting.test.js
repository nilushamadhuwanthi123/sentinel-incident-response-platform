import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';
import { generateIncidentReport } from '../src/services/reportGenerator.js';

describe('audit trail and post-incident reporting', () => {
  beforeEach(() => {
    store.reset();
  });

  it('records and queries immutable audit entries with actor metadata', () => {
    const log = store.createAuditLog({
      actor: { id: 'usr-analyst-01', name: 'Nilusha Madhuwanthi', role: 'ANALYST' },
      action: 'EVIDENCE_TAGGED',
      resource: 'incident',
      resourceId: 'INC-2026-089',
      metadata: { evidenceId: 'ev-998' },
    });

    assert.ok(log.id.startsWith('audit-'));
    assert.equal(log.action, 'EVIDENCE_TAGGED');
    assert.ok(log.timestamp);

    const filtered = store.listAuditLogs({ resourceId: 'INC-2026-089' });
    assert.ok(filtered.some((l) => l.action === 'EVIDENCE_TAGGED'));
  });

  it('generates structured post-incident report with timeline and root cause analysis', () => {
    const report = generateIncidentReport('INC-2026-089');

    assert.equal(report.incidentId, 'INC-2026-089');
    assert.equal(report.severity, 'CRITICAL');
    assert.ok(report.durationMinutes > 0);
    assert.ok(report.rootCause.includes('Credential stuffing'));
    assert.ok(report.recommendations.length >= 1);
    assert.ok(report.timeline.length >= 1);
    assert.ok(report.markdown.includes('# Post-Incident Review: INC-2026-089'));
  });

  it('throws error when generating report for nonexistent incident', () => {
    assert.throws(
      () => {
        generateIncidentReport('INC-DOES-NOT-EXIST');
      },
      /not found/
    );
  });
});

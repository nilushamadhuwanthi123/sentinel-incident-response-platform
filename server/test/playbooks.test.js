import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';
import { executeDefensiveAction, DEFENSIVE_ACTIONS } from '../src/services/playbookEngine.js';

describe('defensive playbooks engine', () => {
  beforeEach(() => {
    store.reset();
  });

  it('contains registered defensive actions with risk reduction metrics', () => {
    assert.ok(DEFENSIVE_ACTIONS.lock_account);
    assert.ok(DEFENSIVE_ACTIONS.block_ip);
    assert.ok(DEFENSIVE_ACTIONS.isolate_service);
    assert.ok(DEFENSIVE_ACTIONS.restart_service);
    assert.ok(DEFENSIVE_ACTIONS.rotate_credentials);

    assert.equal(DEFENSIVE_ACTIONS.block_ip.riskReduction, 35);
  });

  it('executes account lock, lowers incident risk, and moves to CONTAINED', () => {
    const actor = { id: 'usr-analyst-01', name: 'Nilusha Madhuwanthi', role: 'ANALYST' };
    const incidentId = 'INC-2026-089';

    const incBefore = store.getIncidentById(incidentId);
    assert.equal(incBefore.status, 'INVESTIGATING');
    const initialRisk = incBefore.riskScore;

    const outcome = executeDefensiveAction({
      incidentId,
      actionId: 'lock_account',
      target: 'svc-billing-admin',
      actor,
    });

    assert.ok(outcome.action.id.startsWith('act-'));
    assert.equal(outcome.action.state, 'COMPLETED');
    assert.equal(outcome.incident.status, 'CONTAINED');
    assert.ok(outcome.incident.riskScore < initialRisk);

    // Verify Audit Log
    const logs = store.listAuditLogs({ resourceId: incidentId });
    assert.ok(logs.some((l) => l.action === 'RESPONSE_ACTION_EXECUTED'));
  });

  it('executes service isolation and modifies target service status to isolated', () => {
    const actor = { id: 'usr-admin-01', name: 'Kavindu Maduhansa', role: 'ADMIN' };
    const incidentId = 'INC-2026-089';

    executeDefensiveAction({
      incidentId,
      actionId: 'isolate_service',
      target: 'auth',
      actor,
    });

    const authService = store.getServiceById('auth');
    assert.equal(authService.status, 'isolated');
  });

  it('executes graceful service restart and restores service to healthy', () => {
    const actor = { id: 'usr-admin-01', name: 'Kavindu Maduhansa', role: 'ADMIN' };
    const incidentId = 'INC-2026-090';

    executeDefensiveAction({
      incidentId,
      actionId: 'restart_service',
      target: 'database',
      actor,
    });

    const dbService = store.getServiceById('database');
    assert.equal(dbService.status, 'healthy');
  });

  it('rejects unsupported defensive actions', () => {
    assert.throws(
      () => {
        executeDefensiveAction({
          incidentId: 'INC-2026-089',
          actionId: 'offensive_ddos_attack',
          actor: { id: 'usr-1', name: 'Operator', role: 'ADMIN' },
        });
      },
      /Unsupported defensive action/
    );
  });
});

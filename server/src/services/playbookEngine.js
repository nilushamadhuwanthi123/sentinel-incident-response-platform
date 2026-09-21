import { store } from '../data/store.js';
import { broadcast } from '../sockets/index.js';

export const DEFENSIVE_ACTIONS = {
  lock_account: {
    name: 'Lock User Account',
    riskReduction: 25,
    execute: (incident, target) => {
      return {
        success: true,
        message: `Account '${target || 'svc-target'}' disabled and session terminated`,
        simulated: true,
      };
    },
  },
  revoke_tokens: {
    name: 'Revoke Active Tokens',
    riskReduction: 20,
    execute: (incident, target) => {
      return {
        success: true,
        message: `Blacklisted active JWT tokens for '${target || 'identity'}'`,
        simulated: true,
      };
    },
  },
  force_mfa: {
    name: 'Enforce MFA Reset',
    riskReduction: 15,
    execute: (incident, target) => {
      return {
        success: true,
        message: `MFA reset challenge sent to '${target || 'identity'}'`,
        simulated: true,
      };
    },
  },
  block_ip: {
    name: 'Block Attacker IP',
    riskReduction: 35,
    execute: (incident, target) => {
      return {
        success: true,
        message: `Border ingress drop rule applied for CIDR '${target || '203.0.113.47/32'}'`,
        simulated: true,
      };
    },
  },
  isolate_service: {
    name: 'Isolate Targeted Service',
    riskReduction: 30,
    execute: (incident, target) => {
      const serviceId = target || incident.affectedServices?.[0] || 'auth';
      store.updateService(serviceId, { status: 'isolated' });
      broadcast('service:statusChanged', {
        service: serviceId,
        status: 'isolated',
        reason: `Defensive quarantine executed for ${incident.id}`,
        at: new Date().toISOString(),
      });
      return {
        success: true,
        message: `Service '${serviceId}' isolated into quarantine network policy`,
        serviceId,
        newStatus: 'isolated',
        simulated: true,
      };
    },
  },
  restart_service: {
    name: 'Graceful Service Restart',
    riskReduction: 15,
    execute: (incident, target) => {
      const serviceId = target || incident.affectedServices?.[0] || 'gateway';
      store.updateService(serviceId, { status: 'healthy' });
      broadcast('service:statusChanged', {
        service: serviceId,
        status: 'healthy',
        reason: `Service restored after failover/restart`,
        at: new Date().toISOString(),
      });
      return {
        success: true,
        message: `Service '${serviceId}' gracefully restarted and health verified`,
        serviceId,
        newStatus: 'healthy',
        simulated: true,
      };
    },
  },
  rotate_credentials: {
    name: 'Rotate Database Secrets',
    riskReduction: 25,
    execute: (_incident, target) => {
      return {
        success: true,
        message: `Rotated master credentials for secret store '${target || 'db-primary'}'`,
        simulated: true,
      };
    },
  },
  preserve_logs: {
    name: 'Preserve Forensic Artifacts',
    riskReduction: 10,
    execute: (incident, _target) => {
      return {
        success: true,
        message: `Created cryptographic snapshot of security audit logs for ${incident.id}`,
        simulated: true,
      };
    },
  },
};

/**
 * Execute defensive action for an incident.
 */
export function executeDefensiveAction({ incidentId, actionId, playbookId, target, actor }) {
  const incident = store.getIncidentById(incidentId);
  if (!incident) {
    throw new Error(`Incident ${incidentId} not found`);
  }

  const def = DEFENSIVE_ACTIONS[actionId];
  if (!def) {
    throw new Error(`Unsupported defensive action '${actionId}'`);
  }

  // Create action record
  const actionRecord = store.createResponseAction({
    incidentId,
    playbookId: playbookId || 'manual',
    action: actionId,
    target: target || 'default',
    executor: { id: actor.id, name: actor.name, role: actor.role },
  });

  // Emit response:started
  broadcast('response:started', {
    responseId: actionRecord.id,
    incidentId,
    actionId,
    target: actionRecord.target,
    at: actionRecord.startedAt,
  });

  // Execute the simulation countermeasure
  const result = def.execute(incident, target);

  // Update incident risk score and state
  const currentRisk = incident.riskScore ?? 70;
  const newRisk = Math.max(10, currentRisk - def.riskReduction);

  // Automatically transition incident to CONTAINED if not already contained or resolved
  const shouldContain = ['DETECTED', 'TRIAGED', 'INVESTIGATING'].includes(incident.status);
  const nextStatus = shouldContain ? 'CONTAINED' : incident.status;

  const updatedIncident = store.updateIncident(
    incidentId,
    {
      riskScore: newRisk,
      status: nextStatus,
      notes: `Defensive action executed: ${def.name} (${result.message})`,
    },
    actor
  );

  // Mark action completed
  const completedAction = store.updateResponseAction(actionRecord.id, {
    state: 'COMPLETED',
    completedAt: new Date().toISOString(),
    result,
  });

  // Audit log
  store.createAuditLog({
    actor,
    action: 'RESPONSE_ACTION_EXECUTED',
    resource: 'incident',
    resourceId: incidentId,
    metadata: {
      actionId,
      actionName: def.name,
      target,
      newRiskScore: newRisk,
      newStatus: nextStatus,
    },
  });

  // Emit real-time response:completed, incident:updated, risk:changed
  broadcast('response:completed', {
    responseId: actionRecord.id,
    incidentId,
    actionId,
    result,
    newRiskScore: newRisk,
    at: completedAction.completedAt,
  });

  broadcast('incident:updated', updatedIncident);
  broadcast('risk:changed', {
    score: newRisk,
    incidentId,
    at: new Date().toISOString(),
  });

  return {
    action: completedAction,
    incident: updatedIncident,
  };
}

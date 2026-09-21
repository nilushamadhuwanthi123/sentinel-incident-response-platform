/**
 * Canonical Incident Lifecycle state machine.
 */

export const INCIDENT_STATUSES = [
  'DETECTED',
  'TRIAGED',
  'INVESTIGATING',
  'CONTAINED',
  'RESOLVED',
  'CLOSED',
];

export const INCIDENT_SEVERITIES = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
];

const VALID_TRANSITIONS = {
  DETECTED: ['TRIAGED', 'INVESTIGATING', 'CLOSED'],
  TRIAGED: ['INVESTIGATING', 'CONTAINED', 'CLOSED'],
  INVESTIGATING: ['CONTAINED', 'RESOLVED', 'TRIAGED'],
  CONTAINED: ['RESOLVED', 'INVESTIGATING'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
};

/**
 * Validate whether a status transition is permitted.
 */
export function isValidTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(nextStatus));
}

/**
 * Calculate baseline risk score from severity.
 */
export function severityToRiskScore(severity) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return 90;
    case 'HIGH':
      return 70;
    case 'MEDIUM':
      return 45;
    case 'LOW':
      return 20;
    case 'INFO':
    default:
      return 10;
  }
}

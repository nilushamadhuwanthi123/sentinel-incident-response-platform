import { store } from '../data/store.js';

/**
 * Generate a structured post-incident review report grounded in stored incident data.
 */
export function generateIncidentReport(incidentId) {
  const incident = store.getIncidentById(incidentId);
  if (!incident) {
    throw new Error(`Incident ${incidentId} not found`);
  }

  const actions = store.listResponseActions(incidentId);
  const auditLogs = store.listAuditLogs({ resourceId: incidentId });

  const startMs = new Date(incident.createdAt).getTime();
  const endMs = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : Date.now();
  const durationMin = Math.max(1, Math.round((endMs - startMs) / (60 * 1000)));

  // Root cause deduction based on category
  let rootCause = 'Anomalous operational activity requiring manual operator investigation';
  let recommendedFix = 'Implement strict telemetry thresholds and continuous integrity audits';

  switch (incident.category) {
    case 'CREDENTIAL_ACCESS':
      rootCause = 'Credential stuffing / brute-force vector targeting administrative credentials from untrusted ASN';
      recommendedFix = 'Enforce mandatory WebAuthn MFA, rate-limit authentication endpoints, and rotate service account secrets';
      break;
    case 'DENIAL_OF_SERVICE':
      rootCause = 'Layer 7 query flood exploiting unindexed search parameters, leading to database connection pool exhaustion';
      recommendedFix = 'Add ingress rate limiting on API gateway and provision read replicas with connection query timeouts';
      break;
    case 'UNAUTHORIZED_ACCESS':
      rootCause = 'Dormant service account API token utilized outside authorized batch maintenance window';
      recommendedFix = 'Deprecate static API keys in favor of short-lived IAM workload identity tokens';
      break;
    case 'DATA_EXFILTRATION':
      rootCause = 'Suspicious bulk egress queries against primary database cluster';
      recommendedFix = 'Apply strict egress network security policies and configure DLP inspection on object storage';
      break;
  }

  const markdownReport = [
    `# Post-Incident Review: ${incident.id} - ${incident.title}`,
    `**Generated At:** ${new Date().toISOString()}`,
    `**Severity:** ${incident.severity} | **Lifecycle State:** ${incident.status}`,
    `**Duration:** ${durationMin} minutes | **Risk Score:** ${incident.riskScore}/100`,
    '',
    '## 1. Executive Summary',
    incident.summary || 'No summary provided.',
    '',
    '## 2. Affected Services & Impact',
    `Services: ${(incident.affectedServices || []).join(', ') || 'None identified'}`,
    '',
    '## 3. Incident Timeline',
    ...(incident.timeline || []).map(
      (t) => `- **${t.at}** [${t.action}] by *${t.actor}*: ${t.notes}`
    ),
    '',
    '## 4. Defensive Responses Executed',
    ...(actions.length > 0
      ? actions.map(
          (a) =>
            `- **${a.action}** on target \`${a.target}\` (Status: ${a.state}) — Result: ${a.result?.message || 'Completed'}`
        )
      : ['- No automated defensive actions logged.']),
    '',
    '## 5. Root Cause Analysis',
    rootCause,
    '',
    '## 6. Preventative Recommendations',
    recommendedFix,
  ].join('\n');

  return {
    incidentId: incident.id,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    riskScore: incident.riskScore,
    durationMinutes: durationMin,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
    assignee: incident.assignee,
    affectedServices: incident.affectedServices,
    summary: incident.summary,
    rootCause,
    recommendations: [recommendedFix],
    timeline: incident.timeline,
    actionsExecuted: actions,
    auditTrailCount: auditLogs.length,
    markdown: markdownReport,
  };
}

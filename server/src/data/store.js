import bcrypt from 'bcryptjs';
import { isMongoConnected } from './mongoose.js';
import {
  UserModel,
  IncidentModel,
  ServiceModel,
  PlaybookModel,
  EventModel,
  ResponseActionModel,
  AuditLogModel,
} from './models.js';

const SALT_ROUNDS = 10;
const hash = (pwd) => bcrypt.hashSync(pwd, SALT_ROUNDS);

const initialUsers = () => [
  {
    id: 'usr-admin-01',
    name: 'Kavindu Maduhansa',
    email: 'admin@sentinel.sec',
    passwordHash: hash('AdminPassword2026!'),
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLogin: '2026-09-21T08:30:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-21T08:30:00.000Z',
  },
  {
    id: 'usr-analyst-01',
    name: 'Nilusha Madhuwanthi',
    email: 'analyst@sentinel.sec',
    passwordHash: hash('AnalystPassword2026!'),
    role: 'ANALYST',
    status: 'ACTIVE',
    lastLogin: '2026-09-21T09:15:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-21T09:15:00.000Z',
  },
  {
    id: 'usr-viewer-01',
    name: 'Security Auditor',
    email: 'viewer@sentinel.sec',
    passwordHash: hash('ViewerPassword2026!'),
    role: 'VIEWER',
    status: 'ACTIVE',
    lastLogin: null,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  },
];

const initialServices = () => [
  {
    id: 'auth',
    name: 'Identity & Auth Service',
    type: 'API',
    status: 'degraded',
    uptime: 99.4,
    latencyMs: 142,
    errorRate: 4.2,
    cpuPercent: 68,
    memoryPercent: 62,
    requestsPerSec: 320,
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'gateway',
    name: 'API Edge Gateway',
    type: 'GATEWAY',
    status: 'healthy',
    uptime: 99.95,
    latencyMs: 28,
    errorRate: 0.2,
    cpuPercent: 41,
    memoryPercent: 48,
    requestsPerSec: 1250,
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'billing',
    name: 'Billing & Payments',
    type: 'API',
    status: 'healthy',
    uptime: 99.98,
    latencyMs: 54,
    errorRate: 0.1,
    cpuPercent: 24,
    memoryPercent: 35,
    requestsPerSec: 85,
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'database',
    name: 'Core Cluster DB',
    type: 'DATABASE',
    status: 'degraded',
    uptime: 99.6,
    latencyMs: 180,
    errorRate: 3.8,
    cpuPercent: 82,
    memoryPercent: 79,
    requestsPerSec: 890,
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'analytics',
    name: 'Telemetry Aggregator',
    type: 'WORKER',
    status: 'healthy',
    uptime: 99.8,
    latencyMs: 45,
    errorRate: 0.3,
    cpuPercent: 35,
    memoryPercent: 52,
    requestsPerSec: 210,
    lastChecked: new Date().toISOString(),
  },
  {
    id: 'storage',
    name: 'Encrypted Object Storage',
    type: 'STORAGE',
    status: 'healthy',
    uptime: 99.99,
    latencyMs: 18,
    errorRate: 0.0,
    cpuPercent: 18,
    memoryPercent: 29,
    requestsPerSec: 450,
    lastChecked: new Date().toISOString(),
  },
];

const initialPlaybooks = () => [
  {
    id: 'pb-account-compromise',
    title: 'Compromised Account Containment',
    category: 'CREDENTIAL_ACCESS',
    description: 'Defensive procedure to isolate hijacked identities, invalidate tokens, and enforce MFA challenge.',
    actions: [
      {
        id: 'lock_account',
        name: 'Lock User Account',
        description: 'Immediately disable user access to prevent lateral traversal.',
        targetType: 'USER',
        riskReduction: 25,
        estimatedDurationSec: 5,
      },
      {
        id: 'revoke_tokens',
        name: 'Revoke Active Tokens',
        description: 'Flush and blacklist all current session JWTs & refresh tokens.',
        targetType: 'SESSION',
        riskReduction: 30,
        estimatedDurationSec: 8,
      },
      {
        id: 'force_mfa',
        name: 'Enforce MFA Reset',
        description: 'Flag identity for strict hardware token re-enrollment.',
        targetType: 'USER',
        riskReduction: 15,
        estimatedDurationSec: 10,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-network-isolation',
    title: 'Intrusion Source Neutralization',
    category: 'NETWORK_ATTACK',
    description: 'Immediate edge firewall block and subnet isolation for attacking IP ranges.',
    actions: [
      {
        id: 'block_ip',
        name: 'Block Attacker IP CIDR',
        description: 'Deploy ingress drop rule on edge API Gateway.',
        targetType: 'IP',
        riskReduction: 35,
        estimatedDurationSec: 3,
      },
      {
        id: 'isolate_service',
        name: 'Isolate Targeted Service',
        description: 'Sever internal peer connections for the compromised container.',
        targetType: 'SERVICE',
        riskReduction: 40,
        estimatedDurationSec: 12,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-credential-rotation',
    title: 'Privileged Secret Rotation',
    category: 'DATA_EXFILTRATION',
    description: 'Emergency rotation of compromised database credentials and API master keys.',
    actions: [
      {
        id: 'rotate_credentials',
        name: 'Rotate Database & Master Keys',
        description: 'Generate and propagate new cryptographic secrets across pods.',
        targetType: 'SECRET',
        riskReduction: 30,
        estimatedDurationSec: 20,
      },
      {
        id: 'preserve_logs',
        name: 'Preserve Forensic Evidence',
        description: 'Snapshot and cryptographic-hash all volatile security audit logs.',
        targetType: 'EVIDENCE',
        riskReduction: 10,
        estimatedDurationSec: 15,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const initialIncidents = () => [
  {
    id: 'INC-2026-089',
    title: 'Credential Stuffing & Privileged API Enumeration',
    category: 'CREDENTIAL_ACCESS',
    severity: 'CRITICAL',
    status: 'INVESTIGATING',
    riskScore: 86,
    affectedServices: ['auth', 'gateway', 'billing'],
    assignee: { id: 'usr-analyst-01', name: 'Nilusha Madhuwanthi', email: 'analyst@sentinel.sec' },
    summary: 'Burst of 27 failed logins from untrusted ASN 203.0.113.47 followed by token generation and admin endpoint queries.',
    evidence: ['scn-credential-attack-1-4', 'ev-092', 'ev-093'],
    tags: ['credential-stuffing', 'privilege-escalation', 'p1-critical'],
    timeline: [
      { at: '2026-09-21T08:00:00.000Z', action: 'DETECTED', actor: 'System Sensor', notes: 'Threshold alert: 20 failed logins/min' },
      { at: '2026-09-21T08:05:00.000Z', action: 'TRIAGED', actor: 'Nilusha Madhuwanthi', notes: 'Confirmed anomalous IP and target' },
      { at: '2026-09-21T08:12:00.000Z', action: 'INVESTIGATING', actor: 'Nilusha Madhuwanthi', notes: 'Correlated with auth service spike' },
    ],
    createdAt: '2026-09-21T08:00:00.000Z',
    updatedAt: '2026-09-21T08:12:00.000Z',
    resolvedAt: null,
  },
  {
    id: 'INC-2026-090',
    title: 'Layer 7 Ingress Flood & Database Latency Spike',
    category: 'DENIAL_OF_SERVICE',
    severity: 'HIGH',
    status: 'TRIAGED',
    riskScore: 68,
    affectedServices: ['gateway', 'database'],
    assignee: null,
    summary: 'Unusual query burst targeting unindexed search parameter causing thread starvation in database cluster.',
    evidence: ['ev-104', 'ev-105'],
    tags: ['dos', 'database-latency', 'rate-limit'],
    timeline: [
      { at: '2026-09-21T09:10:00.000Z', action: 'DETECTED', actor: 'Gateway Telemetry', notes: 'Latency jumped >150ms' },
      { at: '2026-09-21T09:14:00.000Z', action: 'TRIAGED', actor: 'Kavindu Maduhansa', notes: 'Assigned High severity, preparing failover' },
    ],
    createdAt: '2026-09-21T09:10:00.000Z',
    updatedAt: '2026-09-21T09:14:00.000Z',
    resolvedAt: null,
  },
  {
    id: 'INC-2026-088',
    title: 'Anomalous Token Refresh from Dormant Service Account',
    category: 'UNAUTHORIZED_ACCESS',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    riskScore: 24,
    affectedServices: ['auth'],
    assignee: { id: 'usr-admin-01', name: 'Kavindu Maduhansa', email: 'admin@sentinel.sec' },
    summary: 'Deprecated batch processor service account generated session token outside scheduled cron window.',
    evidence: ['ev-077'],
    tags: ['service-account', 'stale-cred'],
    timeline: [
      { at: '2026-09-20T14:00:00.000Z', action: 'DETECTED', actor: 'Auth Sentinel', notes: 'Dormant account active' },
      { at: '2026-09-20T14:10:00.000Z', action: 'INVESTIGATING', actor: 'Kavindu Maduhansa', notes: 'Investigating script origin' },
      { at: '2026-09-20T14:25:00.000Z', action: 'CONTAINED', actor: 'Kavindu Maduhansa', notes: 'Revoked API keys' },
      { at: '2026-09-20T14:35:00.000Z', action: 'RESOLVED', actor: 'Kavindu Maduhansa', notes: 'Batch cron migrated to IAM role' },
    ],
    createdAt: '2026-09-20T14:00:00.000Z',
    updatedAt: '2026-09-20T14:35:00.000Z',
    resolvedAt: '2026-09-20T14:35:00.000Z',
  },
];

const initialAuditLogs = () => [
  {
    id: 'audit-001',
    actor: { id: 'usr-admin-01', name: 'Kavindu Maduhansa', email: 'admin@sentinel.sec', role: 'ADMIN' },
    action: 'SYSTEM_BOOTSTRAP',
    resource: 'system',
    resourceId: 'sentinel-core',
    timestamp: '2026-09-21T07:00:00.000Z',
    metadata: { environment: 'production-simulated', version: '0.1.0' },
  },
  {
    id: 'audit-002',
    actor: { id: 'usr-analyst-01', name: 'Nilusha Madhuwanthi', email: 'analyst@sentinel.sec', role: 'ANALYST' },
    action: 'INCIDENT_TRIAGED',
    resource: 'incident',
    resourceId: 'INC-2026-089',
    timestamp: '2026-09-21T08:05:00.000Z',
    metadata: { previousStatus: 'DETECTED', newStatus: 'TRIAGED' },
  },
];

// Memory store singleton state
let users = initialUsers();
let services = initialServices();
let playbooks = initialPlaybooks();
let incidents = initialIncidents();
let auditLogs = initialAuditLogs();
let events = [];
let responseActions = [];
let metrics = [];

export const store = {
  reset() {
    users = initialUsers();
    services = initialServices();
    playbooks = initialPlaybooks();
    incidents = initialIncidents();
    auditLogs = initialAuditLogs();
    events = [];
    responseActions = [];
    metrics = [];
  },

  getInitialSeed() {
    return {
      users: initialUsers(),
      services: initialServices(),
      playbooks: initialPlaybooks(),
      incidents: initialIncidents(),
      auditLogs: initialAuditLogs(),
    };
  },

  async hydrateFromMongo() {
    if (!isMongoConnected()) return;
    try {
      const dbUsers = await UserModel.find().lean();
      if (dbUsers.length > 0) users = dbUsers;
      const dbIncidents = await IncidentModel.find().lean();
      if (dbIncidents.length > 0) incidents = dbIncidents;
      const dbServices = await ServiceModel.find().lean();
      if (dbServices.length > 0) services = dbServices;
      const dbPlaybooks = await PlaybookModel.find().lean();
      if (dbPlaybooks.length > 0) playbooks = dbPlaybooks;
      const dbAudit = await AuditLogModel.find().lean();
      if (dbAudit.length > 0) auditLogs = dbAudit;
      console.warn(`[sentinel] hydrated store from MongoDB: ${incidents.length} incidents, ${users.length} users.`);
    } catch (err) {
      console.warn('[sentinel] MongoDB hydration warning:', err.message);
    }
  },

  // --- Users ---
  findUserByEmail(email) {
    if (!email) return null;
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  findUserById(id) {
    return users.find((u) => u.id === id) || null;
  },

  createUser(userData) {
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: null,
      ...userData,
    };
    users.push(newUser);
    if (isMongoConnected()) {
      UserModel.create(newUser).catch(() => {});
    }
    return newUser;
  },

  updateUser(id, updates) {
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() };
    if (isMongoConnected()) {
      UserModel.updateOne({ id }, { $set: updates }).catch(() => {});
    }
    return users[idx];
  },

  listUsers() {
    return users.map((u) => {
      const safe = { ...u };
      delete safe.passwordHash;
      return safe;
    });
  },

  // --- Incidents ---
  listIncidents(filters = {}) {
    let list = [...incidents];
    if (filters.status) {
      const raw = Array.isArray(filters.status)
        ? filters.status
        : String(filters.status).split(',');
      const statuses = raw.map((s) => s.trim().toUpperCase());
      list = list.filter((i) => statuses.includes(i.status?.toUpperCase()));
    }
    if (filters.severity) {
      const raw = Array.isArray(filters.severity)
        ? filters.severity
        : String(filters.severity).split(',');
      const sevs = raw.map((s) => s.trim().toUpperCase());
      list = list.filter((i) => sevs.includes(i.severity?.toUpperCase()));
    }
    if (filters.service) {
      list = list.filter((i) => i.affectedServices?.includes(filters.service));
    }
    if (filters.assigneeId) {
      list = list.filter((i) => i.assignee?.id === filters.assigneeId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getIncidentById(id) {
    return incidents.find((i) => i.id === id) || null;
  },

  createIncident(data) {
    const count = incidents.length + 90;
    const newInc = {
      id: data.id || `INC-2026-${String(count).padStart(3, '0')}`,
      status: 'DETECTED',
      severity: 'MEDIUM',
      riskScore: 50,
      affectedServices: [],
      assignee: null,
      evidence: [],
      tags: [],
      timeline: [
        {
          at: new Date().toISOString(),
          action: 'DETECTED',
          actor: data.creator || 'System Sensor',
          notes: 'Incident detected and logged into platform',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null,
      ...data,
    };
    incidents.unshift(newInc);
    if (isMongoConnected()) {
      IncidentModel.create(newInc).catch(() => {});
    }
    return newInc;
  },

  updateIncident(id, updates, actor) {
    const idx = incidents.findIndex((i) => i.id === id);
    if (idx === -1) return null;

    const existing = incidents[idx];
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // If status changed, record in timeline
    if (updates.status && updates.status !== existing.status) {
      updated.timeline = [
        ...existing.timeline,
        {
          at: new Date().toISOString(),
          action: updates.status,
          actor: actor?.name || 'Operator',
          notes: updates.notes || `Lifecycle transition to ${updates.status}`,
        },
      ];
      if (updates.status === 'RESOLVED' || updates.status === 'CLOSED') {
        updated.resolvedAt = updated.resolvedAt || new Date().toISOString();
      }
    }

    incidents[idx] = updated;
    if (isMongoConnected()) {
      IncidentModel.updateOne({ id }, { $set: updated }).catch(() => {});
    }
    return updated;
  },

  deleteIncident(id) {
    const idx = incidents.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    incidents.splice(idx, 1);
    if (isMongoConnected()) {
      IncidentModel.deleteOne({ id }).catch(() => {});
    }
    return true;
  },

  // --- Services ---
  listServices() {
    return [...services];
  },

  getServiceById(id) {
    return services.find((s) => s.id === id) || null;
  },

  updateService(id, updates) {
    const idx = services.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    services[idx] = { ...services[idx], ...updates, lastChecked: new Date().toISOString() };
    if (isMongoConnected()) {
      ServiceModel.updateOne({ id }, { $set: updates }).catch(() => {});
    }
    return services[idx];
  },

  // --- Metrics ---
  addMetric(metric) {
    const item = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...metric,
    };
    metrics.push(item);
    if (metrics.length > 2000) metrics.shift();
    return item;
  },

  listMetrics(serviceId, limit = 60) {
    let list = metrics;
    if (serviceId) list = list.filter((m) => m.serviceId === serviceId);
    return list.slice(-limit);
  },

  // --- Playbooks ---
  listPlaybooks() {
    return [...playbooks];
  },

  getPlaybookById(id) {
    return playbooks.find((p) => p.id === id) || null;
  },

  // --- Response Actions ---
  createResponseAction(actionData) {
    const action = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      state: 'PENDING',
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      ...actionData,
    };
    responseActions.unshift(action);
    if (isMongoConnected()) {
      ResponseActionModel.create(action).catch(() => {});
    }
    return action;
  },

  listResponseActions(incidentId) {
    if (!incidentId) return [...responseActions];
    return responseActions.filter((a) => a.incidentId === incidentId);
  },

  updateResponseAction(id, updates) {
    const idx = responseActions.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    responseActions[idx] = { ...responseActions[idx], ...updates };
    if (isMongoConnected()) {
      ResponseActionModel.updateOne({ id }, { $set: updates }).catch(() => {});
    }
    return responseActions[idx];
  },

  // --- Audit Logs ---
  createAuditLog(entry) {
    const log = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    auditLogs.unshift(log);
    if (auditLogs.length > 1000) auditLogs.pop();
    if (isMongoConnected()) {
      AuditLogModel.create(log).catch(() => {});
    }
    return log;
  },

  listAuditLogs(filters = {}) {
    let list = [...auditLogs];
    if (filters.actorId) {
      list = list.filter((l) => l.actor?.id === filters.actorId);
    }
    if (filters.action) {
      list = list.filter((l) => l.action === filters.action);
    }
    if (filters.resource) {
      list = list.filter((l) => l.resource === filters.resource);
    }
    if (filters.resourceId) {
      list = list.filter((l) => l.resourceId === filters.resourceId);
    }
    return list;
  },

  // --- Raw Events ---
  createEvent(evt) {
    const event = {
      id: evt.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: evt.at || new Date().toISOString(),
      simulated: true,
      ...evt,
    };
    events.unshift(event);
    if (events.length > 500) events.pop();
    if (isMongoConnected()) {
      EventModel.create(event).catch(() => {});
    }
    return event;
  },

  listEvents(filters = {}, limit = 50) {
    let list = [...events];
    if (filters.type) list = list.filter((e) => e.type === filters.type);
    if (filters.service) list = list.filter((e) => e.service === filters.service);
    if (filters.sourceIp) list = list.filter((e) => e.sourceIp === filters.sourceIp);
    return list.slice(0, limit);
  },
};

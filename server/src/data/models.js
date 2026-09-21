import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'ANALYST', 'VIEWER'], default: 'ANALYST' },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    lastLogin: { type: String, default: null },
  },
  { timestamps: true }
);

const IncidentSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, default: 'SECURITY_ANOMALY' },
    severity: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'], default: 'MEDIUM' },
    status: {
      type: String,
      enum: ['DETECTED', 'TRIAGED', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED'],
      default: 'DETECTED',
    },
    riskScore: { type: Number, default: 50 },
    affectedServices: [{ type: String }],
    assignee: {
      id: String,
      name: String,
      email: String,
    },
    summary: { type: String, default: '' },
    evidence: [{ type: String }],
    tags: [{ type: String }],
    timeline: [
      {
        at: { type: String, default: () => new Date().toISOString() },
        action: String,
        actor: String,
        notes: String,
      },
    ],
    resolvedAt: { type: String, default: null },
  },
  { timestamps: true }
);

const EventSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    at: { type: String, default: () => new Date().toISOString() },
    type: { type: String, required: true },
    service: { type: String, required: true },
    severity: { type: String, default: 'MEDIUM' },
    sourceIp: { type: String, default: '127.0.0.1' },
    userId: { type: String, default: null },
    sessionId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    simulated: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ServiceSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, default: 'API' },
    status: { type: String, enum: ['healthy', 'degraded', 'down', 'isolated'], default: 'healthy' },
    uptime: { type: Number, default: 99.9 },
    latencyMs: { type: Number, default: 40 },
    errorRate: { type: Number, default: 0.1 },
    cpuPercent: { type: Number, default: 35 },
    memoryPercent: { type: Number, default: 45 },
    requestsPerSec: { type: Number, default: 100 },
    lastChecked: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
);

const MetricSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    serviceId: { type: String, required: true },
    metricType: { type: String, required: true },
    value: { type: Number, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true }
);

const PlaybookSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    actions: [
      {
        id: String,
        name: String,
        description: String,
        targetType: String,
        riskReduction: Number,
        estimatedDurationSec: Number,
      },
    ],
  },
  { timestamps: true }
);

const ResponseActionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    incidentId: { type: String, required: true },
    playbookId: { type: String, default: 'manual' },
    action: { type: String, required: true },
    target: { type: String, default: 'default' },
    state: { type: String, enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
    executor: {
      id: String,
      name: String,
      role: String,
    },
    startedAt: { type: String, default: () => new Date().toISOString() },
    completedAt: { type: String, default: null },
    result: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    actor: {
      id: String,
      name: String,
      email: String,
      role: String,
    },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String, required: true },
    timestamp: { type: String, default: () => new Date().toISOString() },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || model('User', UserSchema);
export const IncidentModel = mongoose.models.Incident || model('Incident', IncidentSchema);
export const EventModel = mongoose.models.Event || model('Event', EventSchema);
export const ServiceModel = mongoose.models.Service || model('Service', ServiceSchema);
export const MetricModel = mongoose.models.Metric || model('Metric', MetricSchema);
export const PlaybookModel = mongoose.models.Playbook || model('Playbook', PlaybookSchema);
export const ResponseActionModel = mongoose.models.ResponseAction || model('ResponseAction', ResponseActionSchema);
export const AuditLogModel = mongoose.models.AuditLog || model('AuditLog', AuditLogSchema);

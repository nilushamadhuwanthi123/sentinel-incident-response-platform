import express from 'express';
import { store } from '../data/store.js';
import {
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  isValidTransition,
  severityToRiskScore,
} from '../services/incidentLifecycle.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';
import { broadcast } from '../sockets/index.js';

export const incidentsRouter = express.Router();

/**
 * GET /api/incidents
 * List incidents with optional query filters.
 */
incidentsRouter.get('/', optionalAuthenticate, (req, res) => {
  const { status, severity, service, assigneeId, search } = req.query;

  const incidents = store.listIncidents({
    status,
    severity,
    service,
    assigneeId,
    search,
  });

  res.json({
    ok: true,
    total: incidents.length,
    incidents,
  });
});

/**
 * GET /api/incidents/:id
 * Retrieve single incident detail with associated response actions.
 */
incidentsRouter.get('/:id', optionalAuthenticate, (req, res) => {
  const { id } = req.params;
  const incident = store.getIncidentById(id);

  if (!incident) {
    return res.status(404).json({ ok: false, error: `Incident ${id} not found` });
  }

  const actions = store.listResponseActions(id);

  res.json({
    ok: true,
    incident,
    actions,
  });
});

/**
 * POST /api/incidents
 * Create a new incident. Requires ANALYST or ADMIN role.
 */
incidentsRouter.post('/', authenticate, requireRole(['ADMIN', 'ANALYST']), (req, res) => {
  const {
    title,
    summary,
    category = 'SECURITY_ANOMALY',
    severity = 'MEDIUM',
    affectedServices = [],
    assigneeId,
    tags = [],
    riskScore,
  } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Incident title is required' });
  }

  const normalizedSeverity = INCIDENT_SEVERITIES.includes(severity?.toUpperCase())
    ? severity.toUpperCase()
    : 'MEDIUM';

  let assignee = null;
  if (assigneeId) {
    const user = store.findUserById(assigneeId);
    if (user) {
      assignee = { id: user.id, name: user.name, email: user.email };
    }
  }

  const computedRisk = typeof riskScore === 'number'
    ? Math.max(0, Math.min(100, riskScore))
    : severityToRiskScore(normalizedSeverity);

  const incident = store.createIncident({
    title: title.trim(),
    summary: summary ? summary.trim() : 'Manual incident record created by operator',
    category,
    severity: normalizedSeverity,
    riskScore: computedRisk,
    affectedServices: Array.isArray(affectedServices) ? affectedServices : [affectedServices],
    assignee,
    tags: Array.isArray(tags) ? tags : [],
    creator: req.user.name,
  });

  store.createAuditLog({
    actor: req.user,
    action: 'INCIDENT_CREATED',
    resource: 'incident',
    resourceId: incident.id,
    metadata: { title: incident.title, severity: incident.severity },
  });

  // Broadcast real-time event to all connected operators
  broadcast('incident:new', incident);

  res.status(201).json({
    ok: true,
    incident,
  });
});

/**
 * PATCH /api/incidents/:id
 * Update incident fields or trigger lifecycle status transitions.
 */
incidentsRouter.patch('/:id', authenticate, requireRole(['ADMIN', 'ANALYST']), (req, res) => {
  const { id } = req.params;
  const incident = store.getIncidentById(id);

  if (!incident) {
    return res.status(404).json({ ok: false, error: `Incident ${id} not found` });
  }

  const {
    status,
    severity,
    riskScore,
    assigneeId,
    summary,
    affectedServices,
    tags,
    notes,
  } = req.body || {};

  const updates = {};

  if (status) {
    const normalizedStatus = status.toUpperCase();
    if (!INCIDENT_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid status '${status}'. Must be one of [${INCIDENT_STATUSES.join(', ')}]`,
      });
    }

    if (!isValidTransition(incident.status, normalizedStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid lifecycle transition from ${incident.status} to ${normalizedStatus}`,
      });
    }

    updates.status = normalizedStatus;
    if (notes) updates.notes = notes;
  }

  if (severity) {
    const normSev = severity.toUpperCase();
    if (INCIDENT_SEVERITIES.includes(normSev)) {
      updates.severity = normSev;
    }
  }

  if (typeof riskScore === 'number') {
    updates.riskScore = Math.max(0, Math.min(100, riskScore));
  }

  if (summary !== undefined) {
    updates.summary = summary;
  }

  if (affectedServices !== undefined) {
    updates.affectedServices = Array.isArray(affectedServices)
      ? affectedServices
      : [affectedServices];
  }

  if (tags !== undefined) {
    updates.tags = Array.isArray(tags) ? tags : [];
  }

  if (assigneeId !== undefined) {
    if (assigneeId === null || assigneeId === '') {
      updates.assignee = null;
    } else {
      const user = store.findUserById(assigneeId);
      if (user) {
        updates.assignee = { id: user.id, name: user.name, email: user.email };
      }
    }
  }

  const updatedIncident = store.updateIncident(id, updates, req.user);

  store.createAuditLog({
    actor: req.user,
    action: 'INCIDENT_UPDATED',
    resource: 'incident',
    resourceId: id,
    metadata: { updates },
  });

  // Broadcast real-time events
  broadcast('incident:updated', updatedIncident);
  if (updates.status === 'RESOLVED') {
    broadcast('incident:resolved', updatedIncident);
  }

  res.json({
    ok: true,
    incident: updatedIncident,
  });
});

/**
 * DELETE /api/incidents/:id
 * Purge incident record. Restricted to ADMIN.
 */
incidentsRouter.delete('/:id', authenticate, requireRole(['ADMIN']), (req, res) => {
  const { id } = req.params;
  const existing = store.getIncidentById(id);

  if (!existing) {
    return res.status(404).json({ ok: false, error: `Incident ${id} not found` });
  }

  store.deleteIncident(id);

  store.createAuditLog({
    actor: req.user,
    action: 'INCIDENT_DELETED',
    resource: 'incident',
    resourceId: id,
    metadata: { title: existing.title },
  });

  res.json({
    ok: true,
    message: `Incident ${id} deleted successfully`,
  });
});

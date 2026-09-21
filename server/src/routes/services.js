import express from 'express';
import { store } from '../data/store.js';
import { broadcast } from '../sockets/index.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';

export const servicesRouter = express.Router();

const ALLOWED_STATUSES = ['healthy', 'degraded', 'down', 'isolated'];

/**
 * GET /api/services
 * List all platform microservices and their health telemetry.
 */
servicesRouter.get('/', optionalAuthenticate, (_req, res) => {
  const services = store.listServices();
  res.json({
    ok: true,
    total: services.length,
    services,
  });
});

/**
 * GET /api/services/:id
 * Retrieve details of a specific service.
 */
servicesRouter.get('/:id', optionalAuthenticate, (req, res) => {
  const service = store.getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ ok: false, error: `Service ${req.params.id} not found` });
  }
  res.json({ ok: true, service });
});

/**
 * PATCH /api/services/:id/status
 * Operator manual status override (isolate, failover, restore).
 */
servicesRouter.patch(
  '/:id/status',
  authenticate,
  requireRole(['ADMIN', 'ANALYST']),
  (req, res) => {
    const { id } = req.params;
    const { status, reason = 'Operator override' } = req.body || {};

    const service = store.getServiceById(id);
    if (!service) {
      return res.status(404).json({ ok: false, error: `Service ${id} not found` });
    }

    const normStatus = status?.toLowerCase();
    if (!ALLOWED_STATUSES.includes(normStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid status '${status}'. Allowed: [${ALLOWED_STATUSES.join(', ')}]`,
      });
    }

    const updated = store.updateService(id, { status: normStatus });

    store.createAuditLog({
      actor: req.user,
      action: 'SERVICE_STATUS_OVERRIDE',
      resource: 'service',
      resourceId: id,
      metadata: { previousStatus: service.status, newStatus: normStatus, reason },
    });

    broadcast('service:statusChanged', {
      service: id,
      status: normStatus,
      reason,
      at: new Date().toISOString(),
    });

    res.json({
      ok: true,
      service: updated,
    });
  }
);

import express from 'express';
import { store } from '../data/store.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const auditRouter = express.Router();

/**
 * GET /api/audit
 * Retrieve immutable audit logs with optional filtering.
 */
auditRouter.get('/', optionalAuthenticate, (req, res) => {
  const { actorId, action, resource, resourceId, limit } = req.query;
  const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  let logs = store.listAuditLogs({
    actorId,
    action,
    resource,
    resourceId,
  });

  logs = logs.slice(0, parsedLimit);

  res.json({
    ok: true,
    total: logs.length,
    auditLogs: logs,
  });
});

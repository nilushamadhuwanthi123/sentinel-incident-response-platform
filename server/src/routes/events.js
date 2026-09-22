import express from 'express';
import { store } from '../data/store.js';
import { broadcast } from '../sockets/index.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const eventsRouter = express.Router();

export const ALLOWED_EVENT_TYPES = new Set([
  'FAILED_LOGIN',
  'UNKNOWN_IP',
  'PRIVILEGE_ESCALATION',
  'SENSITIVE_API_ACCESS',
  'SERVICE_DOWN',
  'DATABASE_ERROR',
  'API_LATENCY',
  'REQUEST_SPIKE',
]);

function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') {
    return { valid: false, error: 'Event must be a non-empty object' };
  }

  if (!evt.type || !ALLOWED_EVENT_TYPES.has(evt.type)) {
    return {
      valid: false,
      error: `Invalid event type '${evt.type}'. Allowed: [${Array.from(ALLOWED_EVENT_TYPES).join(', ')}]`,
    };
  }

  if (!evt.service || typeof evt.service !== 'string') {
    return { valid: false, error: 'Event must specify a target service' };
  }

  return { valid: true };
}

/**
 * GET /api/events
 * List recently ingested security and operational events.
 */
eventsRouter.get('/', optionalAuthenticate, (req, res) => {
  const { type, service, sourceIp, limit } = req.query;
  const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  const list = store.listEvents({ type, service, sourceIp }, parsedLimit);

  res.json({
    ok: true,
    total: list.length,
    events: list,
  });
});

/**
 * POST /api/events
 * Ingest single or batch telemetry events.
 */
eventsRouter.post('/', optionalAuthenticate, (req, res) => {
  const payload = req.body;
  const items = Array.isArray(payload) ? payload : [payload];

  if (items.length === 0) {
    return res.status(400).json({ ok: false, error: 'No events provided in request body' });
  }

  const ingested = [];
  const errors = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const check = validateEvent(item);
    if (!check.valid) {
      errors.push({ index: i, error: check.error });
      continue;
    }

    const saved = store.createEvent({
      type: item.type,
      service: item.service.toLowerCase(),
      severity: item.severity || 'MEDIUM',
      sourceIp: item.sourceIp || '127.0.0.1',
      userId: item.userId || null,
      sessionId: item.sessionId || null,
      metadata: item.metadata || {},
      at: item.at || new Date().toISOString(),
    });

    // Broadcast immediately over Socket.IO so threat radar, correlation, and topology update live
    broadcast('event:new', saved);

    // If service failure event, update service health and broadcast status change
    if (item.type === 'SERVICE_DOWN') {
      store.updateService(item.service.toLowerCase(), { status: 'down' });
      broadcast('service:statusChanged', {
        service: item.service.toLowerCase(),
        status: 'down',
        reason: `Automated alert: ${item.type}`,
        at: saved.at,
      });
    }

    ingested.push(saved);
  }

  if (ingested.length === 0 && errors.length > 0) {
    return res.status(400).json({
      ok: false,
      error: 'All events failed validation',
      details: errors,
    });
  }

  res.status(201).json({
    ok: true,
    count: ingested.length,
    events: ingested,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
});

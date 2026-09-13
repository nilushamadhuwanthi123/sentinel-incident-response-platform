import { Router } from 'express';
import { hasDatabase } from '../config.js';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'sentinel-server',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    store: hasDatabase() ? 'mongodb' : 'in-memory',
    time: new Date().toISOString(),
  });
});

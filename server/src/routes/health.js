import { Router } from 'express';
import { hasDatabase } from '../config.js';
import { isMongoConnected } from '../data/mongoose.js';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/', (_req, res) => {
  const connected = isMongoConnected();
  res.json({
    ok: true,
    service: 'sentinel-server',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    store: connected ? 'mongodb' : (hasDatabase() ? 'connecting' : 'in-memory'),
    databaseConnected: connected,
    time: new Date().toISOString(),
  });
});

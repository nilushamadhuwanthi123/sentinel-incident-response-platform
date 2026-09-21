import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config, hasDatabase } from './config.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { incidentsRouter } from './routes/incidents.js';
import { eventsRouter } from './routes/events.js';
import { playbooksRouter, incidentActionsRouter } from './routes/playbooks.js';
import { servicesRouter } from './routes/services.js';
import { metricsRouter } from './routes/metrics.js';
import { analyticsRouter } from './routes/analytics.js';
import { auditRouter } from './routes/audit.js';
import { registerSocketHandlers } from './sockets/index.js';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many authentication attempts, please try again later.' },
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use('/api', apiLimiter);

app.use('/api/health', healthRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/incidents/:id/actions', incidentActionsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/playbooks', playbooksRouter);
app.use('/api/services', servicesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/audit', auditRouter);

// Unknown API routes answer in the same shape as everything else, so the
// client never has to branch on "was this JSON or an HTML error page".
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[sentinel] unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigins, credentials: true },
});

registerSocketHandlers(io);

server.listen(config.port, () => {
  console.warn(
    `[sentinel] listening on :${config.port} (${config.env}) — ` +
      `store: ${hasDatabase() ? 'mongodb' : 'in-memory simulation'}`
  );
});

export { app, server, io };

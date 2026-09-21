import express from 'express';
import { store } from '../data/store.js';
import { broadcast } from '../sockets/index.js';
import { optionalAuthenticate } from '../middleware/auth.js';

export const metricsRouter = express.Router();

/**
 * GET /api/metrics/summary
 * Aggregate health and system-wide telemetry summary.
 */
metricsRouter.get('/summary', optionalAuthenticate, (_req, res) => {
  const services = store.listServices();

  const counts = {
    total: services.length,
    healthy: services.filter((s) => s.status === 'healthy').length,
    degraded: services.filter((s) => s.status === 'degraded').length,
    down: services.filter((s) => s.status === 'down').length,
    isolated: services.filter((s) => s.status === 'isolated').length,
  };

  const totalRps = services.reduce((acc, s) => acc + (s.requestsPerSec || 0), 0);
  const avgLatency = Math.round(
    services.reduce((acc, s) => acc + (s.latencyMs || 0), 0) / (services.length || 1)
  );
  const avgErrorRate = parseFloat(
    (services.reduce((acc, s) => acc + (s.errorRate || 0), 0) / (services.length || 1)).toFixed(2)
  );
  const avgCpu = Math.round(
    services.reduce((acc, s) => acc + (s.cpuPercent || 0), 0) / (services.length || 1)
  );
  const avgMem = Math.round(
    services.reduce((acc, s) => acc + (s.memoryPercent || 0), 0) / (services.length || 1)
  );

  let overallHealth = 'healthy';
  if (counts.down > 0) overallHealth = 'critical';
  else if (counts.degraded > 0 || counts.isolated > 0) overallHealth = 'degraded';

  res.json({
    ok: true,
    overallHealth,
    counts,
    telemetry: {
      requestsPerSec: totalRps,
      averageLatencyMs: avgLatency,
      averageErrorRatePercent: avgErrorRate,
      averageCpuPercent: avgCpu,
      averageMemoryPercent: avgMem,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/metrics/history
 * Generate realistic historical sparkline data for charts.
 */
metricsRouter.get('/history', optionalAuthenticate, (req, res) => {
  const { serviceId, points = 24 } = req.query;
  const numPoints = Math.min(60, Math.max(10, Number(points) || 24));

  const service = serviceId ? store.getServiceById(serviceId) : null;
  const baseLatency = service?.latencyMs || 65;
  const baseCpu = service?.cpuPercent || 42;
  const baseRps = service?.requestsPerSec || 500;

  const history = [];
  const now = Date.now();
  const stepMs = 60 * 1000; // 1 min per point

  for (let i = numPoints - 1; i >= 0; i -= 1) {
    const t = new Date(now - i * stepMs).toISOString();
    // Deterministic pseudo-variation around base values
    const jitter = Math.sin(i * 0.7) * 12 + Math.cos(i * 0.3) * 8;
    history.push({
      timestamp: t,
      latencyMs: Math.max(10, Math.round(baseLatency + jitter)),
      cpuPercent: Math.max(5, Math.min(99, Math.round(baseCpu + jitter * 0.8))),
      requestsPerSec: Math.max(50, Math.round(baseRps + jitter * 15)),
      errorRate: parseFloat(Math.max(0, Math.min(10, (jitter + 15) * 0.1)).toFixed(2)),
    });
  }

  res.json({
    ok: true,
    serviceId: serviceId || 'global',
    points: history.length,
    series: history,
  });
});

/**
 * POST /api/metrics
 * Ingest external metric datum and broadcast via socket.
 */
metricsRouter.post('/', optionalAuthenticate, (req, res) => {
  const { serviceId, metricType, value } = req.body || {};

  if (!serviceId || !metricType || typeof value !== 'number') {
    return res.status(400).json({
      ok: false,
      error: 'serviceId, metricType, and numeric value are required',
    });
  }

  const metric = store.addMetric({ serviceId, metricType, value });

  broadcast('metric:updated', {
    service: serviceId,
    metric: metricType,
    value,
    at: metric.timestamp,
  });

  res.status(201).json({
    ok: true,
    metric,
  });
});

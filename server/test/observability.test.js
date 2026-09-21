import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';

describe('observability & telemetry service', () => {
  beforeEach(() => {
    store.reset();
  });

  it('provides comprehensive microservice health records', () => {
    const list = store.listServices();
    assert.ok(list.length >= 6);

    const auth = list.find((s) => s.id === 'auth');
    assert.ok(auth);
    assert.ok(typeof auth.uptime === 'number');
    assert.ok(typeof auth.latencyMs === 'number');
    assert.ok(typeof auth.cpuPercent === 'number');
    assert.ok(typeof auth.memoryPercent === 'number');
    assert.ok(typeof auth.requestsPerSec === 'number');
    assert.ok(auth.lastChecked);
  });

  it('updates service status and records timestamp', () => {
    const updated = store.updateService('storage', { status: 'degraded' });
    assert.equal(updated.status, 'degraded');
    assert.ok(updated.lastChecked);

    const fetched = store.getServiceById('storage');
    assert.equal(fetched.status, 'degraded');
  });

  it('stores and retrieves service metrics with size bounding', () => {
    for (let i = 0; i < 10; i += 1) {
      store.addMetric({ serviceId: 'gateway', metricType: 'latency', value: 20 + i });
    }

    const gatewayMetrics = store.listMetrics('gateway');
    assert.equal(gatewayMetrics.length, 10);
    assert.equal(gatewayMetrics[9].value, 29);
    assert.ok(gatewayMetrics[0].timestamp);
  });
});

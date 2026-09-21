import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { store } from '../src/data/store.js';
import { ALLOWED_EVENT_TYPES } from '../src/routes/events.js';

describe('event ingestion engine', () => {
  beforeEach(() => {
    store.reset();
  });

  it('contains canonical security and operational event types', () => {
    const expected = [
      'FAILED_LOGIN',
      'UNKNOWN_IP',
      'PRIVILEGE_ESCALATION',
      'SENSITIVE_API_ACCESS',
      'SERVICE_DOWN',
      'DATABASE_ERROR',
      'API_LATENCY',
      'REQUEST_SPIKE',
    ];

    for (const t of expected) {
      assert.ok(ALLOWED_EVENT_TYPES.has(t), `Missing expected event type: ${t}`);
    }
  });

  it('stores individual valid events with simulation marker', () => {
    const evt = store.createEvent({
      type: 'FAILED_LOGIN',
      service: 'auth',
      sourceIp: '198.51.100.22',
      userId: 'root',
      metadata: { reason: 'invalid_password' },
    });

    assert.ok(evt.id.startsWith('ev-'));
    assert.equal(evt.type, 'FAILED_LOGIN');
    assert.equal(evt.service, 'auth');
    assert.equal(evt.simulated, true);

    const list = store.listEvents({ type: 'FAILED_LOGIN' });
    assert.ok(list.length >= 1);
    assert.equal(list[0].id, evt.id);
  });

  it('filters ingested events by service and source IP', () => {
    store.createEvent({ type: 'DATABASE_ERROR', service: 'database', sourceIp: '10.0.0.5' });
    store.createEvent({ type: 'API_LATENCY', service: 'gateway', sourceIp: '10.0.0.5' });
    store.createEvent({ type: 'UNKNOWN_IP', service: 'auth', sourceIp: '203.0.113.88' });

    const dbEvents = store.listEvents({ service: 'database' });
    assert.equal(dbEvents.length, 1);
    assert.equal(dbEvents[0].type, 'DATABASE_ERROR');

    const ipEvents = store.listEvents({ sourceIp: '10.0.0.5' });
    assert.equal(ipEvents.length, 2);
  });

  it('updates service health upon receiving SERVICE_DOWN telemetry', () => {
    const serviceBefore = store.getServiceById('billing');
    assert.equal(serviceBefore.status, 'healthy');

    store.updateService('billing', { status: 'down' });
    const serviceAfter = store.getServiceById('billing');
    assert.equal(serviceAfter.status, 'down');
  });
});

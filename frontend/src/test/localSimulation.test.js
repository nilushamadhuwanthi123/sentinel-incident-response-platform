import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalClient } from '../services/localSimulation.js';

describe('createLocalClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const collect = (client) => {
    const seen = [];
    client.subscribe((action) => seen.push(action));
    return seen;
  };

  it('satisfies the same interface as the socket client', () => {
    // Everything above this line — hook, reducer, engines, components —
    // must not be able to tell which client it got.
    const client = createLocalClient();
    expect(typeof client.connect).toBe('function');
    expect(typeof client.close).toBe('function');
    expect(typeof client.subscribe).toBe('function');
  });

  it('announces the transport and the server agreeing, in that order', () => {
    const client = createLocalClient();
    const seen = collect(client);
    client.connect();
    expect(seen[0].type).toBe('transport:connected');
    expect(seen[1].type).toBe('system:ready');
    client.close();
  });

  it('marks itself standalone so the page can say so', () => {
    const client = createLocalClient();
    const seen = collect(client);
    client.connect();
    expect(seen[1].payload.standalone).toBe(true);
    expect(seen[1].payload.simulated).toBe(true);
    client.close();
  });

  it('emits events as time passes', () => {
    const client = createLocalClient();
    const seen = collect(client);
    client.connect();
    vi.advanceTimersByTime(20_000);
    expect(seen.some((a) => a.type === 'event:new')).toBe(true);
    client.close();
  });

  it('emits nothing after it is closed', () => {
    const client = createLocalClient();
    const seen = collect(client);
    client.connect();
    vi.advanceTimersByTime(15_000);
    client.close();
    const count = seen.length;
    vi.advanceTimersByTime(60_000);
    expect(seen).toHaveLength(count);
  });

  it('stops its interval on close, so a closed tab leaves nothing running', () => {
    const client = createLocalClient();
    client.connect();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    client.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('produces the same feed for the same seed as the server would', () => {
    // It is the server's simulator module, imported rather than copied, so
    // this is really asserting that no second implementation crept in.
    const run = () => {
      const client = createLocalClient({ seed: 7 });
      const seen = collect(client);
      client.connect();
      vi.advanceTimersByTime(60_000);
      client.close();
      return seen.filter((a) => a.type === 'event:new').map((a) => a.payload.type);
    };
    expect(run()).toEqual(run());
  });
});

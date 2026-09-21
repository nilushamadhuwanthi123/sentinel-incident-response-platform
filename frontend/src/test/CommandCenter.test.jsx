import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from '../App.jsx';

/**
 * A fake socket client.
 *
 * This is the payoff for wrapping socket.io behind a three-method
 * interface: the entire screen can be driven through its real code path —
 * hook, reducer, engines, render — without a server, a port or a wait.
 */
function fakeClient() {
  const listeners = new Set();
  const client = {
    connect: vi.fn(function connect() {
      this.emit({ type: 'transport:connected', at: Date.now() });
      return this;
    }),
    close: vi.fn(() => listeners.clear()),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(action) {
      listeners.forEach((fn) => fn(action));
    },
    connected: true,
  };
  return client;
}

const mount = () => {
  const client = fakeClient();
  // The whole application, so the shell's header, routing and single
  // shared connection are exercised on the same path production uses.
  const view = render(<App socketOptions={{ createClient: () => client }} />);
  return { client, view };
};

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const iso = (ms) => new Date(T0 + ms).toISOString();

const event = (overrides = {}) => ({
  id: 'e1',
  type: 'FAILED_LOGIN',
  at: iso(0),
  service: 'auth',
  sourceIp: '203.0.113.47',
  userId: 'svc-billing-admin',
  sessionId: 'sess-8841',
  ...overrides,
});

const sendAttack = (client) => {
  act(() => {
    client.emit({ type: 'event:new', at: Date.now(), payload: event({ id: 'a0', type: 'UNKNOWN_IP', service: 'edge-gateway' }) });
    for (let i = 0; i < 27; i += 1) {
      client.emit({
        type: 'event:new',
        at: Date.now(),
        payload: event({ id: `f-${i}`, at: iso(1000 + i * 1000) }),
      });
    }
    client.emit({ type: 'event:new', at: Date.now(), payload: event({ id: 'a1', type: 'PRIVILEGE_ESCALATION', at: iso(40_000) }) });
    client.emit({ type: 'event:new', at: Date.now(), payload: event({ id: 'a2', type: 'SENSITIVE_API_ACCESS', at: iso(50_000), service: 'storage' }) });
  });
};

describe('CommandCenter', () => {
  it('says it is a simulation before it says anything else', () => {
    // The disclosure is in the page, at the top, not in a footer. If this
    // test ever fails, the interface has started implying the feed is real.
    mount();
    expect(screen.getByText(/Simulation\./i)).toBeInTheDocument();
    expect(screen.getByText(/no vulnerability scanning is performed/i)).toBeInTheDocument();
  });

  it('reports the connection state as soon as it connects', () => {
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
  });

  it('starts with no incident, and says so as a finding', () => {
    mount();
    expect(screen.getByText(/Nothing correlated/i)).toBeInTheDocument();
  });

  it('turns a burst of events into one named incident with its reasoning', () => {
    const { client } = mount();
    sendAttack(client);

    // "Escalation chain", not "credential attack": the classifier names the
    // most specific pattern these events have actually earned. Without a
    // privileged-identity marker on the account, the stronger claim is not
    // justified — and asserting the stronger label here would be asserting
    // that the engine over-claims.
    expect(screen.getByText(/escalation chain/i)).toBeInTheDocument();
    // The reasoning is rendered, not just the conclusion: a reader is never
    // asked to trust the classification.
    expect(screen.getByText(/failed authentications/i)).toBeInTheDocument();
  });

  it('scores the risk and shows what produced it', () => {
    const { client } = mount();
    sendAttack(client);

    const gauge = screen.getByRole('img', { name: /Risk score/i });
    expect(gauge).toBeInTheDocument();
    expect(screen.getByText(/Repeated failed authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/Sensitive resource accessed/i)).toBeInTheDocument();
  });

  it('renders arriving events, newest first', () => {
    const { client } = mount();
    act(() => {
      client.emit({ type: 'event:new', at: Date.now(), payload: event({ id: 'old', at: iso(0) }) });
      client.emit({
        type: 'event:new',
        at: Date.now(),
        payload: event({ id: 'new', type: 'SERVICE_DOWN', at: iso(60_000), service: 'core-api' }),
      });
    });
    const rows = screen.getAllByRole('row').slice(1); // drop the header
    expect(rows[0]).toHaveTextContent('service down');
  });

  it('shows a service that changed state, with the reason given', () => {
    const { client } = mount();
    act(() => {
      client.emit({
        type: 'service:statusChanged',
        at: Date.now(),
        payload: {
          service: 'auth',
          status: 'compromised',
          reason: 'Privilege escalation observed on an active session',
          at: iso(0),
        },
      });
    });
    expect(screen.getByText('Compromised')).toBeInTheDocument();
    expect(screen.getByText(/Privilege escalation observed/i)).toBeInTheDocument();
  });

  it('marks the page degraded when the feed drops, so no number reads as current', () => {
    const { client, view } = mount();
    act(() => {
      client.emit({ type: 'transport:disconnected', at: Date.now(), reason: 'transport close' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('RECONNECTING');
    expect(view.container.querySelector('main')).toHaveAttribute('data-degraded', 'true');
  });

  it('keeps the connection badge out of the part that dims', () => {
    // Dimming the explanation along with the data would be the one mistake
    // that makes the degraded state worse than no indicator at all, so the
    // badge lives in the header and only the panel bodies dim.
    const { client, view } = mount();
    act(() => {
      client.emit({ type: 'transport:disconnected', at: Date.now(), reason: 'transport close' });
    });
    const badge = screen.getByRole('status');
    expect(badge.closest('main')).toBeNull();
    expect(
      view.container.querySelector('.panel-body').closest('[data-degraded="true"]')
    ).not.toBeNull();
  });

  it('names every service in the topology, not only the ones that changed', () => {
    // Service names appear both on the topology map and in the health
    // strip, so the query is scoped to the strip rather than loosened.
    const { view } = mount();
    const strip = view.container.querySelector('.strip');
    expect(within(strip).getByText('Auth Service')).toBeInTheDocument();
    expect(within(strip).getByText('Database')).toBeInTheDocument();
  });

  it('closes the socket when it unmounts', () => {
    const { client, view } = mount();
    view.unmount();
    expect(client.close).toHaveBeenCalled();
  });

  it('gives the page one h1 and a skip link as the first tab stop', () => {
    const { view } = mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(view.container.querySelector('.skip-link')).toHaveAttribute('href', '#main');
  });
});

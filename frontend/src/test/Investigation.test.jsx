import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from '../App.jsx';

/** The same fake client the Command Center tests drive the app with. */
function fakeClient() {
  const listeners = new Set();
  return {
    connect: vi.fn(function connect() {
      this.emit({ type: 'transport:connected', at: Date.now() });
      return this;
    }),
    close: vi.fn(),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(action) {
      listeners.forEach((fn) => fn(action));
    },
    connected: true,
  };
}

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

const attack = [
  event({ id: 'a0', type: 'UNKNOWN_IP', at: iso(0), service: 'edge-gateway' }),
  ...Array.from({ length: 27 }, (_, i) =>
    event({ id: `f-${i}`, at: iso(1000 + i * 1000) })
  ),
  event({ id: 'a1', type: 'PRIVILEGE_ESCALATION', at: iso(40_000) }),
  event({ id: 'a2', type: 'SENSITIVE_API_ACCESS', at: iso(50_000), service: 'storage' }),
];

const mount = () => {
  const client = fakeClient();
  const view = render(<App socketOptions={{ createClient: () => client }} />);
  return { client, view };
};

const send = (client, events) =>
  act(() => {
    events.forEach((payload) =>
      client.emit({ type: 'event:new', at: Date.now(), payload })
    );
  });

const goToInvestigation = () =>
  fireEvent.click(screen.getByRole('link', { name: /Investigate/i }));

describe('Investigation workspace', () => {
  it('is reachable from the shell', () => {
    mount();
    expect(screen.getByRole('link', { name: /Investigate/i })).toBeInTheDocument();
  });

  it('says plainly when there is nothing to investigate, and calls it a finding', () => {
    mount();
    goToInvestigation();
    expect(screen.getByText(/a finding in itself/i)).toBeInTheDocument();
  });

  it('shows the incident with its confidence and its risk', () => {
    const { client } = mount();
    send(client, attack);
    goToInvestigation();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/escalation chain/i);
    expect(screen.getByText('CONFIDENCE')).toBeInTheDocument();
    expect(screen.getByText('RISK')).toBeInTheDocument();
  });

  it('draws every stage of the chain, not only the ones reached', () => {
    // The empty stages are the point: how far this has got, and what is left.
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();
    expect(view.container.querySelectorAll('.chain-stage')).toHaveLength(6);
    expect(view.container.querySelectorAll('.chain-stage--ahead').length).toBeGreaterThan(0);
  });

  it('distinguishes a gap from a stage not yet reached', () => {
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();
    // Discovery was never observed but Collection was, so it is a gap.
    const gaps = view.container.querySelectorAll('.chain-stage--gap');
    expect(gaps.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not observed/i).length).toBeGreaterThan(0);
  });

  it('names what the model says comes next without calling it a prediction', () => {
    const { client } = mount();
    send(client, attack);
    goToInvestigation();
    expect(screen.getByText(/Next in this model/i)).toBeInTheDocument();
    expect(screen.getByText(/not a prediction of intent/i)).toBeInTheDocument();
  });

  it('refuses to claim an ATT&CK mapping it does not implement', () => {
    const { client } = mount();
    send(client, attack);
    goToInvestigation();
    expect(screen.getByText(/not a MITRE ATT&CK mapping/i)).toBeInTheDocument();
  });

  it('lists the entities the events have in common', () => {
    // The address also appears on every evidence row, which is correct, so
    // the query is scoped to the entity list rather than loosened.
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();
    const entities = view.container.querySelector('.inv-entities');
    expect(within(entities).getByText('203.0.113.47')).toBeInTheDocument();
    expect(within(entities).getByText('svc-billing-admin')).toBeInTheDocument();
  });

  it('shows the correlation reasoning with its rule names', () => {
    // Every claim on the page traces back to the evidence that produced it.
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();
    const reasons = view.container.querySelectorAll('.inv-reasons li');
    expect(reasons.length).toBeGreaterThan(0);
    expect(view.container.querySelector('.inv-reason-rule')).toBeInTheDocument();
  });

  it('shows the raw evidence for this incident', () => {
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();
    const table = view.container.querySelector('.inv-table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBe(attack.length);
  });

  it('filters the evidence by event type', () => {
    const { client, view } = mount();
    send(client, attack);
    goToInvestigation();

    fireEvent.click(screen.getByRole('button', { name: /^privilege escalation$/i }));
    const rows = within(view.container.querySelector('.inv-table'))
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(1);
  });

  it('offers the response console against the same incident', () => {
    const { client } = mount();
    send(client, attack);
    goToInvestigation();
    expect(screen.getByText(/removes \d+ points/i)).toBeInTheDocument();
  });

  it('returns to the Command Center', () => {
    const { client } = mount();
    send(client, attack);
    goToInvestigation();
    // The shell's nav link and the workspace's own back link both lead
    // there; this exercises the back link.
    fireEvent.click(screen.getByRole('link', { name: /← Command Center/i }));
    expect(screen.getByText(/Simulation\./i)).toBeInTheDocument();
  });

  it('opens one connection for the whole application, not one per view', () => {
    // Two connections would mean two independent simulations in standalone
    // mode, so an investigation would show a different incident than the
    // one that was clicked.
    const { client } = mount();
    send(client, attack);
    goToInvestigation();
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ThreatRadar } from '../components/command/ThreatRadar.jsx';

const NOW = Date.parse('2026-09-13T09:47:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

const event = (o = {}) => ({
  id: 'e1',
  type: 'FAILED_LOGIN',
  at: ago(5000),
  service: 'auth',
  sourceIp: '203.0.113.47',
  userId: 'svc-billing-admin',
  ...o,
});

const events = [
  event({ id: 'e1', type: 'FAILED_LOGIN' }),
  event({ id: 'e2', type: 'PRIVILEGE_ESCALATION', severityScore: 92, at: ago(20_000) }),
  event({ id: 'e3', type: 'SENSITIVE_API_ACCESS', service: 'storage', at: ago(30_000) }),
];

const mount = (list = events) => render(<ThreatRadar events={list} now={NOW} />);

describe('ThreatRadar', () => {
  it('draws one blip per active signal', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.radar-blip')).toHaveLength(3);
  });

  it('does not add a second live region competing with the connection badge', () => {
    mount();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('gives the scope the same summary the engine generated', () => {
    // The picture and its text equivalent come from one frame, so they
    // cannot drift apart.
    mount();
    const scope = screen.getByRole('img');
    expect(scope).toHaveAccessibleName(/3 active signals/i);
    expect(scope).toHaveAccessibleName(/2 critical/i);
  });

  it('lists every signal as a real table row, not only as a dot', () => {
    mount();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(screen.getByRole('button', { name: /privilege escalation/i })).toBeInTheDocument();
  });

  it('halos a critical signal that nobody has acknowledged', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.radar-halo').length).toBeGreaterThan(0);
  });

  it('drops the halo once the signal is acknowledged', () => {
    const { container } = mount([
      event({ id: 'ack', type: 'PRIVILEGE_ESCALATION', severityScore: 92, acknowledged: true }),
    ]);
    expect(container.querySelectorAll('.radar-halo')).toHaveLength(0);
  });

  it('selects a signal from the list and shows its detail', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /privilege escalation/i }));
    expect(screen.getByText('203.0.113.47')).toBeInTheDocument();
    expect(screen.getByText('svc-billing-admin')).toBeInTheDocument();
  });

  it('deselects when the same signal is chosen again', () => {
    mount();
    const button = screen.getByRole('button', { name: /privilege escalation/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('breaks the picture down by sector', () => {
    mount();
    // "Identity" is both a sector label on the scope and a legend entry, so
    // the query is scoped to the legend rather than made vaguer.
    const legend = document.querySelector('.radar-legend');
    const identity = within(legend).getByText('Identity').closest('li');
    expect(identity).toHaveTextContent('2');
  });

  it('places worse signals closer to the centre', () => {
    // The one property that makes the radar a chart rather than a graphic.
    const { container } = mount([
      event({ id: 'mild', type: 'API_LATENCY' }),
      event({ id: 'severe', type: 'PRIVILEGE_ESCALATION' }),
    ]);
    const blips = [...container.querySelectorAll('.radar-blip')];
    const distance = (el) =>
      Math.hypot(Number(el.getAttribute('cx')) - 160, Number(el.getAttribute('cy')) - 160);
    // Signals are painted least-severe first, so the last blip is the worst.
    expect(distance(blips[blips.length - 1])).toBeLessThan(distance(blips[0]));
  });

  it('says plainly when the scope is clear, and calls it a finding', () => {
    mount([]);
    expect(screen.getByRole('img')).toHaveAccessibleName('No active signals.');
    expect(screen.getByText(/That is a finding/i)).toBeInTheDocument();
  });

  it('survives junk in the event list', () => {
    const { container } = mount([event(), null, 'nonsense']);
    expect(container.querySelectorAll('.radar-blip')).toHaveLength(1);
  });
});

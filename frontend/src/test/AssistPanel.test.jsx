import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AssistPanel } from '../components/command/AssistPanel.jsx';
import { computeRisk } from '../engines/riskEngine.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => new Date(T0 + ms).toISOString();

const incident = () => ({
  confidence: 86,
  riskSignals: [
    { id: 'REPEATED_AUTH_FAILURE', count: 27 },
    'UNKNOWN_EXTERNAL_IP',
    'PRIVILEGED_ACCOUNT',
    'PRIVILEGE_ESCALATION',
    'SENSITIVE_RESOURCE_ACCESS',
  ],
  events: [
    { id: '1', type: 'UNKNOWN_IP', at: at(0) },
    { id: '2', type: 'FAILED_LOGIN', at: at(1000) },
    { id: '3', type: 'PRIVILEGE_ESCALATION', at: at(2000) },
    { id: '4', type: 'SENSITIVE_API_ACCESS', at: at(3000) },
  ],
});

const risk = () => computeRisk({ signals: incident().riskSignals });

describe('AssistPanel', () => {
  it('leads with the disclosure, before any guidance', () => {
    // A box labelled "Assist" in a security console reads as a model unless
    // it says otherwise. If this test ever fails, the panel has started
    // borrowing credibility it has not earned.
    const { container } = render(<AssistPanel incident={incident()} risk={risk()} />);
    const first = container.querySelector('.assist > *');
    expect(first).toHaveClass('assist-disclosure');
    expect(first).toHaveTextContent(/not a language model/i);
    expect(first).toHaveTextContent(/no external ai is called/i);
  });

  it('shows guidance drawn from the current state', () => {
    render(<AssistPanel incident={incident()} risk={risk()} />);
    expect(screen.getAllByText(/Act|Caution|Context/).length).toBeGreaterThan(0);
  });

  it('names the rule behind every note', () => {
    // A reader who disagrees can find the condition that fired — which is
    // exactly what a model cannot offer.
    const { container } = render(<AssistPanel incident={incident()} risk={risk()} />);
    const rules = container.querySelectorAll('.assist-rule');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].textContent).toMatch(/^[A-Z_]+$/);
  });

  it('says how many rules matched, not only what it chose to show', () => {
    render(<AssistPanel incident={incident()} risk={risk()} />);
    expect(screen.getByText(/rules matched/i)).toBeInTheDocument();
  });

  it('says nothing rather than filling space when no rule applies', () => {
    render(<AssistPanel incident={{ confidence: 90, riskSignals: [], events: [] }} />);
    expect(screen.getByText(/filler would only teach a reader to skip/i)).toBeInTheDocument();
  });

  it('renders with no incident at all', () => {
    const { container } = render(<AssistPanel />);
    expect(container.querySelector('.assist-disclosure')).toBeInTheDocument();
  });

  it('translates a blast radius into what users lose', () => {
    render(
      <AssistPanel
        incident={incident()}
        risk={risk()}
        blast={{
          origin: { label: 'Auth Service' },
          counts: { workflows: 2 },
          workflows: [{ label: 'Sign in' }, { label: 'Checkout' }],
        }}
      />
    );
    expect(screen.getByText(/sign in and checkout stop working/i)).toBeInTheDocument();
  });
});

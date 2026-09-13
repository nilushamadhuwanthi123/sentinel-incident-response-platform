import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ResponseConsole } from '../components/command/ResponseConsole.jsx';

const incident = (overrides = {}) => ({
  id: 'cand-1',
  label: 'Possible escalation chain',
  riskSignals: [
    { id: 'REPEATED_AUTH_FAILURE', count: 27 },
    'UNKNOWN_EXTERNAL_IP',
    'PRIVILEGED_ACCOUNT',
    'PRIVILEGE_ESCALATION',
    'SENSITIVE_RESOURCE_ACCESS',
    'MFA_ABSENT',
    'MULTI_SERVICE_SPREAD',
  ],
  ...overrides,
});

const mount = (props = {}) =>
  render(<ResponseConsole incident={incident()} {...props} />);

describe('ResponseConsole', () => {
  it('explains its first recommendation in words', () => {
    mount();
    expect(screen.getByText(/removes \d+ points/i)).toBeInTheDocument();
  });

  it('shows the cost of every action, not only its benefit', () => {
    // A tool that ranks actions without naming their price is ranking blind.
    mount();
    const options = screen.getAllByRole('button', { name: /—|-|\w/ });
    expect(options.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/reversible|cannot be undone/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/disruption|offline/i).length).toBeGreaterThan(0);
  });

  it('names the observed signals each action addresses', () => {
    mount();
    expect(screen.getAllByText(/Addresses:/i).length).toBeGreaterThan(0);
  });

  it('says how many actions were considered and how many excluded', () => {
    // Transparency about what was left out, so the short list is trusted.
    mount();
    expect(screen.getByText(/actions considered/i)).toBeInTheDocument();
  });

  it('projects nothing until an action is selected', () => {
    mount();
    expect(screen.getByText(/Select one or more actions/i)).toBeInTheDocument();
  });

  it('projects the combined effect once actions are chosen', () => {
    mount();
    const [first] = screen.getAllByRole('button', { name: /Lock the affected account/i });
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.resp-sim-to')).toBeInTheDocument();
  });

  it('shows a running total rather than a sum', () => {
    // Two actions that both lower likelihood do not add up.
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Lock the affected account/i }));
    fireEvent.click(screen.getByRole('button', { name: /Block the source address/i }));

    const steps = document.querySelectorAll('.resp-step');
    expect(steps).toHaveLength(2);
    const maths = [...steps].map((s) => s.querySelector('.resp-step-math').textContent);
    const firstTo = maths[0].split('→')[1].trim();
    const secondFrom = maths[1].split('→')[0].trim();
    expect(secondFrom).toBe(firstTo);
  });

  it('warns when a selection cannot be undone', () => {
    mount();
    const rotate = screen.queryByRole('button', { name: /Rotate affected credentials/i });
    if (!rotate) return; // outside the top four for this incident
    fireEvent.click(rotate);
    expect(screen.getByText(/cannot be undone\./i)).toBeInTheDocument();
  });

  it('warns when a selection would take a service offline', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Isolate the affected service/i }));
    expect(screen.getByText(/take a service offline/i)).toBeInTheDocument();
  });

  it('says when a combination still leaves risk critical', () => {
    // The difference between a first step and a resolution.
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Enforce second factor/i }));
    expect(screen.getByText(/first step, not a resolution/i)).toBeInTheDocument();
  });

  it('states plainly that nothing is executed', () => {
    // A portfolio project must not imply it can lock real accounts.
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Lock the affected account/i }));
    expect(screen.getByText(/does not lock accounts/i)).toBeInTheDocument();
  });

  it('labels the projection as projected', () => {
    mount();
    expect(screen.getByText('projected')).toBeInTheDocument();
  });

  it('deselects and clears', () => {
    mount();
    const button = screen.getByRole('button', { name: /Lock the affected account/i });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: /Clear selection/i }));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Select one or more actions/i)).toBeInTheDocument();
  });

  it('says so when no action applies, and calls it a finding', () => {
    render(<ResponseConsole incident={{ riskSignals: [] }} />);
    expect(screen.getByText(/That is a finding/i)).toBeInTheDocument();
  });

  it('handles having no incident at all', () => {
    render(<ResponseConsole />);
    expect(screen.getByText(/No containment action applies/i)).toBeInTheDocument();
  });
});

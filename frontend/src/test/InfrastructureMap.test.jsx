import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InfrastructureMap } from '../components/command/InfrastructureMap.jsx';
import { DEFAULT_TOPOLOGY } from '../engines/topology.js';

const mount = (services = {}) => render(<InfrastructureMap services={services} />);

describe('InfrastructureMap', () => {
  it('draws every service in the topology', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.topo-node')).toHaveLength(
      DEFAULT_TOPOLOGY.nodes.length
    );
  });

  it('lays out identically on every render', () => {
    // A force-directed graph rearranges itself each time, so the picture an
    // operator learned yesterday is not the one they see today. Depth from
    // the internet boundary is a real property, so it is what positions the
    // nodes — and that makes the layout reproducible.
    const a = mount().container.querySelector('svg').innerHTML;
    const b = mount().container.querySelector('svg').innerHTML;
    expect(a).toBe(b);
  });

  it('draws a soft dependency differently from a hard one', () => {
    // The difference decides whether a failure propagates, so it has to be
    // visible rather than annotated.
    const { container } = mount();
    expect(container.querySelectorAll('.topo-edge--hard').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.topo-edge--soft').length).toBeGreaterThan(0);
  });

  it('marks a compromised service without being told where it is', () => {
    const { container } = mount({
      auth: { status: 'compromised', reason: 'escalation observed' },
    });
    expect(container.querySelectorAll('.topo-node--compromised')).toHaveLength(1);
  });

  it('lowers system health when a service is compromised', () => {
    const healthy = mount().container.querySelector('.topo-health-score').textContent;
    const hurt = mount({ database: { status: 'offline' } }).container.querySelector(
      '.topo-health-score'
    ).textContent;
    expect(Number(hurt)).toBeLessThan(Number(healthy));
  });

  it('ranks services by what their failure would cost, not by likelihood', () => {
    mount();
    expect(screen.getByText(/Ranked by cost of failure/i)).toBeInTheDocument();
    expect(screen.getByText(/the platform cannot know that/i)).toBeInTheDocument();
  });

  it('projects a failure when a service is selected', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));

    expect(screen.getByText(/Auth Service failure/i)).toBeInTheDocument();
    expect(screen.getByText(/services affected/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.topo-node.is-blast').length).toBeGreaterThan(1);
  });

  it('labels the projection as projected, never as observed', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));
    expect(screen.getByText('projected')).toBeInTheDocument();
  });

  it('names the user-facing workflows that stop working', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));
    const workflows = document.querySelector('.topo-workflows');
    expect(within(workflows).getByText(/Sign in/i)).toBeInTheDocument();
  });

  it('shows the projected health alongside the current one', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));
    expect(container.querySelector('.topo-health-after')).toBeInTheDocument();
  });

  it('clears the projection', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));
    fireEvent.click(screen.getByRole('button', { name: /Clear projection/i }));
    expect(container.querySelectorAll('.topo-node.is-blast')).toHaveLength(0);
    expect(screen.getByText(/Ranked by cost of failure/i)).toBeInTheDocument();
  });

  it('describes the graph to assistive technology, and the projection when there is one', () => {
    mount();
    expect(screen.getByRole('img')).toHaveAccessibleName(/dependency graph/i);
    fireEvent.click(screen.getByRole('button', { name: /Auth Service/i }));
    expect(screen.getByRole('img')).toHaveAccessibleName(/Auth Service failure/i);
  });
});

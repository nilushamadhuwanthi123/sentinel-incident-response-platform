import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ForensicsDesk } from '../components/command/ForensicsDesk.jsx';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => new Date(T0 + ms).toISOString();

const incident = () => ({
  id: 'cand-1',
  label: 'Possible escalation chain',
  events: [
    { id: 'e1', type: 'UNKNOWN_IP', at: at(0), service: 'edge-gateway' },
    { id: 'e2', type: 'FAILED_LOGIN', at: at(1000), service: 'auth' },
    { id: 'e3', type: 'PRIVILEGE_ESCALATION', at: at(2000), service: 'auth' },
  ],
});

const mount = () =>
  render(<ForensicsDesk incident={incident()} capturedAt={T0} />);

describe('ForensicsDesk', () => {
  it('leads with what the checksum cannot prove', () => {
    // A panel that looked like chain-of-custody evidence and was not would
    // be worse than no panel.
    const { container } = mount();
    const first = container.querySelector('.fx > *');
    expect(first).toHaveClass('fx-caveat');
    expect(first).toHaveTextContent(/Checksum, not a signature/i);
    expect(first).toHaveTextContent(/not chain-of-custody evidence/i);
    expect(first).toHaveTextContent(/does not detect deliberate alteration/i);
  });

  it('lists every record with its own checksum and its chained one', () => {
    const { container } = mount();
    const rows = container.querySelectorAll('.fx-table tbody tr');
    expect(rows).toHaveLength(3);
    const cells = rows[0].querySelectorAll('td');
    expect(cells[2].textContent).toMatch(/^[0-9a-f]{8}$/);
    expect(cells[3].textContent).toMatch(/^[0-9a-f]{8}$/);
  });

  it('shows the seal', () => {
    const { container } = mount();
    expect(container.querySelector('.fx-seal').textContent).toMatch(/^[0-9a-f]{8}$/);
  });

  it('verifies an untouched package', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Verify the package/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/the chain reaches the seal/i);
  });

  it('offers the package as a download', () => {
    // The export is the deliverable; the panel is only where it is made.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();

    mount();
    fireEvent.click(screen.getByRole('button', { name: /Download evidence package/i }));

    expect(click).toHaveBeenCalled();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it('says so when there is nothing to package', () => {
    render(<ForensicsDesk />);
    expect(screen.getByText(/Evidence is collected per incident/i)).toBeInTheDocument();
  });

  it('reports how many events were discarded', () => {
    const broken = incident();
    broken.events = [...broken.events, { type: 'NO_ID', at: at(3000) }];
    render(<ForensicsDesk incident={broken} capturedAt={T0} />);
    const discarded = screen.getByText('Discarded').closest('div');
    expect(discarded).toHaveTextContent('1');
  });
});

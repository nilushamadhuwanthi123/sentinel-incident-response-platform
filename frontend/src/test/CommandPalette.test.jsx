import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandPalette } from '../components/shared/CommandPalette.jsx';

const commands = (overrides = {}) => [
  { id: 'a', label: 'Go to Command Center', group: 'Navigate', run: vi.fn(), ...overrides },
  { id: 'b', label: 'Go to Investigation workspace', group: 'Navigate', run: vi.fn() },
  { id: 'c', label: 'Simulate Auth Service failure', group: 'Simulate', run: vi.fn() },
];

const open = (list = commands(), onOpenChange = vi.fn()) => {
  const view = render(
    <CommandPalette commands={list} open onOpenChange={onOpenChange} />
  );
  return { view, onOpenChange, input: screen.getByRole('combobox') };
};

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette commands={commands()} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a combobox owning a listbox, not a div with an input in it', () => {
    // The difference is whether a screen-reader user can use it at all.
    const { input } = open();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'palette-list');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('takes focus on open', () => {
    const { input } = open();
    expect(input).toHaveFocus();
  });

  it('announces the active option rather than moving focus into the list', () => {
    const { input } = open();
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(input).toHaveFocus();
  });

  it('wraps at both ends of the list', () => {
    const { input } = open();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('filters as you type and resets the selection', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'sim' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/Simulate/);
  });

  it('runs the active command on Enter and closes', () => {
    const list = commands();
    const { input, onOpenChange } = open(list);
    fireEvent.change(input, { target: { value: 'sim' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(list[2].run).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('runs a command on click', () => {
    const list = commands();
    open(list);
    fireEvent.click(screen.getByText('Go to Investigation workspace'));
    expect(list[1].run).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { input, onOpenChange } = open();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes when the backdrop is clicked, but not the dialog', () => {
    const { view, onOpenChange } = open();
    fireEvent.mouseDown(view.container.querySelector('.palette'));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(view.container.querySelector('.palette-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lists an unavailable command with its reason instead of hiding it', () => {
    // A palette where a command silently does not exist teaches someone
    // that the palette is unreliable.
    const list = [
      {
        id: 'b',
        label: 'Go to Investigation workspace',
        group: 'Navigate',
        disabled: true,
        reason: 'No incident is currently correlated',
        run: vi.fn(),
      },
    ];
    open(list);
    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/No incident is currently correlated/)).toBeInTheDocument();
  });

  it('refuses to run a disabled command', () => {
    const run = vi.fn();
    const list = [
      { id: 'b', label: 'Disabled thing', group: 'Navigate', disabled: true, reason: 'nope', run },
    ];
    const { input, onOpenChange } = open(list);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('opens on the keyboard shortcut', () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette commands={commands()} open={false} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('returns focus to whatever opened it', () => {
    // A dialog that drops focus at the top of the document makes every
    // keyboard user start again.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    let isOpen = false;
    const onOpenChange = vi.fn((next) => {
      isOpen = next;
    });
    const { rerender } = render(
      <CommandPalette commands={commands()} open={isOpen} onOpenChange={onOpenChange} />
    );

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    rerender(<CommandPalette commands={commands()} open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    expect(opener).toHaveFocus();
    opener.remove();
  });
});

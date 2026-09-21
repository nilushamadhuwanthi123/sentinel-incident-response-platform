/**
 * Command palette.
 *
 * Opened with ⌘K / Ctrl+K. Built to the ARIA combobox pattern rather than
 * as a div with a text input in it, because the difference is whether a
 * screen-reader user can use the palette at all:
 *
 *   - the input owns the listbox and announces the active option
 *   - focus stays in the input; arrow keys move `aria-activedescendant`
 *   - Escape closes and returns focus to whatever opened it
 *
 * Focus return is the part most often skipped and the most noticeable when
 * missing: a dialog that dumps focus at the top of the document when it
 * closes makes every keyboard user start again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { moveSelection, rankCommands } from '../../engines/commandRegistry.js';

export function CommandPalette({ commands = [], open, onOpenChange }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const openerRef = useRef(null);

  const results = useMemo(() => rankCommands(commands, query), [commands, query]);

  const close = useCallback(() => {
    onOpenChange?.(false);
    // Return focus to whatever had it. Without this a keyboard user is
    // dropped at the top of the document and has to start again.
    openerRef.current?.focus?.();
    openerRef.current = null;
  }, [onOpenChange]);

  // Global shortcut. Registered once, on document, because the palette can
  // be opened from anywhere including a focused input.
  useEffect(() => {
    const onKey = (event) => {
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!combo) return;
      event.preventDefault();
      openerRef.current = document.activeElement;
      onOpenChange?.(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const activeId = results[index] ? `cmd-${results[index].id}` : undefined;

  const run = (command) => {
    if (!command || command.disabled) return;
    close();
    command.run?.();
  };

  const onKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setIndex((i) => moveSelection(i, 1, results.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setIndex((i) => moveSelection(i, -1, results.length));
        break;
      case 'Enter':
        event.preventDefault();
        run(results[index]);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />

        <ul className="palette-list" id="palette-list" role="listbox" aria-label="Commands">
          {results.map((command, i) => (
            <li
              key={command.id}
              id={`cmd-${command.id}`}
              role="option"
              aria-selected={i === index}
              aria-disabled={command.disabled || undefined}
              className={`palette-item ${i === index ? 'is-active' : ''} ${
                command.disabled ? 'is-disabled' : ''
              }`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(command)}
            >
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {/* Unavailable commands stay listed with their reason. A
                  palette where a command silently does not exist teaches
                  someone that the palette is unreliable. */}
              {command.disabled && (
                <span className="palette-reason">{command.reason}</span>
              )}
            </li>
          ))}
        </ul>

        {results.length === 0 && (
          <p className="palette-empty">Nothing matches “{query}”.</p>
        )}

        <p className="palette-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to run ·{' '}
          <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}

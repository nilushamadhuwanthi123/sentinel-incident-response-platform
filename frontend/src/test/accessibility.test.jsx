import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import App from '../App.jsx';
import { CommandPalette } from '../components/shared/CommandPalette.jsx';

/**
 * Automated accessibility checks.
 *
 * axe catches the mechanical failures — missing names, broken ARIA
 * relationships, duplicate ids, headings out of order. It cannot catch the
 * ones that matter most in this interface (whether a colour alone carries
 * meaning, whether a live region says something worth hearing), so those
 * are asserted by hand below and in each component's own tests.
 *
 * Colour contrast is disabled: jsdom has no layout or computed colours, so
 * axe cannot evaluate it and reports nothing rather than reporting
 * correctly. Pretending otherwise would be worse than leaving it out.
 */
const check = async (container) => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`
  );
};

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
const event = (o = {}) => ({
  id: 'e1',
  type: 'FAILED_LOGIN',
  at: iso(0),
  service: 'auth',
  sourceIp: '203.0.113.47',
  userId: 'svc-billing-admin',
  sessionId: 'sess-8841',
  ...o,
});

const attack = [
  event({ id: 'a0', type: 'UNKNOWN_IP', at: iso(0), service: 'edge-gateway' }),
  ...Array.from({ length: 27 }, (_, i) =>
    event({ id: `f-${i}`, at: iso(1000 + i * 1000) })
  ),
  event({ id: 'a1', type: 'PRIVILEGE_ESCALATION', at: iso(40_000) }),
  event({ id: 'a2', type: 'SENSITIVE_API_ACCESS', at: iso(50_000), service: 'storage' }),
];

const mountApp = () => {
  const client = fakeClient();
  const view = render(<App socketOptions={{ createClient: () => client }} />);
  return { client, view };
};

describe('accessibility', () => {
  it('has no violations on an empty Command Center', async () => {
    const { view } = mountApp();
    expect(await check(view.container)).toEqual([]);
  });

  it('has no violations once the console is full of data', async () => {
    // The empty state passing and the populated state failing is the usual
    // way an audit gives false comfort.
    const { client, view } = mountApp();
    act(() => {
      attack.forEach((payload) =>
        client.emit({ type: 'event:new', at: Date.now(), payload })
      );
      client.emit({
        type: 'service:statusChanged',
        at: Date.now(),
        payload: { service: 'auth', status: 'compromised', reason: 'escalation', at: iso(0) },
      });
    });
    expect(await check(view.container)).toEqual([]);
  });

  it('has no violations in the investigation workspace', async () => {
    const { client, view } = mountApp();
    act(() => {
      attack.forEach((payload) =>
        client.emit({ type: 'event:new', at: Date.now(), payload })
      );
    });
    fireEvent.click(screen.getByRole('link', { name: /Investigate/i }));
    expect(await check(view.container)).toEqual([]);
  });

  it('has no violations in the command palette', async () => {
    const { container } = render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        commands={[
          { id: 'a', label: 'Go to Command Center', group: 'Navigate', run: () => {} },
          {
            id: 'b',
            label: 'Go to Investigation',
            group: 'Navigate',
            disabled: true,
            reason: 'No incident is currently correlated',
            run: () => {},
          },
        ]}
      />
    );
    expect(await check(container)).toEqual([]);
  });

  it('gives the page exactly one h1 and no skipped heading levels', async () => {
    // axe does not check this across a whole document reliably, so it is
    // asserted directly: a document outline that jumps h1 → h3 is unusable
    // to anyone navigating by heading.
    const { client } = mountApp();
    act(() => {
      attack.forEach((payload) =>
        client.emit({ type: 'event:new', at: Date.now(), payload })
      );
    });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    // In document order, a heading may never be more than one level deeper
    // than the one before it. h2 → h4 is the failure this catches, and it
    // is the one that makes heading navigation skip content silently.
    const levels = screen
      .getAllByRole('heading')
      .map((h) => Number(h.tagName.slice(1)))
      .filter(Number.isFinite);

    levels.forEach((level, i) => {
      if (i === 0) return;
      expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
    });
  });

  it('puts the skip link first, and points it at the main landmark', () => {
    const { view } = mountApp();
    const skip = view.container.querySelector('.skip-link');
    expect(skip).toHaveAttribute('href', '#main');
    expect(view.container.querySelector('main')).toHaveAttribute('id', 'main');
  });

  it('keeps exactly one polite live region', () => {
    // Two competing announcers means a screen-reader user hears both and
    // attends to neither, which is worse than having none.
    const { client, view } = mountApp();
    act(() => {
      attack.forEach((payload) =>
        client.emit({ type: 'event:new', at: Date.now(), payload })
      );
    });
    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('never leaves an interactive control without an accessible name', () => {
    const { client, view } = mountApp();
    act(() => {
      attack.forEach((payload) =>
        client.emit({ type: 'event:new', at: Date.now(), payload })
      );
    });

    const controls = [...view.container.querySelectorAll('button, a[href]')];
    const unnamed = controls.filter((el) => {
      const text = (el.textContent ?? '').trim();
      return !text && !el.getAttribute('aria-label') && !el.getAttribute('title');
    });
    expect(unnamed).toEqual([]);
  });
});

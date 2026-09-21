import { describe, expect, it, vi } from 'vitest';
import {
  buildCommands,
  matchCommand,
  moveSelection,
  rankCommands,
} from '../commandRegistry.js';

const command = (label, keywords = '') => ({ id: label, label, keywords });

describe('matchCommand', () => {
  it('matches a subsequence, not only a substring', () => {
    // "vrd" should find "View threat radar" — that is how people type into
    // a palette.
    expect(matchCommand(command('View threat radar'), 'vrd')).not.toBeNull();
  });

  it('returns null when a character is missing', () => {
    expect(matchCommand(command('View threat radar'), 'vrz')).toBeNull();
  });

  it('returns an empty match for an empty query rather than null', () => {
    // Zero and no-match are different answers, and a caller that treats a
    // zero score as a miss would show an empty palette on open.
    const match = matchCommand(command('Anything'), '');
    expect(match).not.toBeNull();
    expect(match.score).toBe(0);
  });

  it('scores word-initial matches above mid-word ones', () => {
    const initials = matchCommand(command('Simulate auth failure'), 'saf');
    const midword = matchCommand(command('Assist panel figures'), 'saf');
    expect(initials.score).toBeGreaterThan(midword?.score ?? 0);
  });

  it('scores adjacent matches above scattered ones', () => {
    const run = matchCommand(command('Radar view'), 'rad');
    const scattered = matchCommand(command('Reset all data'), 'rad');
    expect(run.score).toBeGreaterThan(scattered.score);
  });

  it('prefers a match in the label over one in the hidden keywords', () => {
    const inLabel = matchCommand(command('Blast radius'), 'blast');
    const inKeywords = matchCommand(command('Simulate failure', 'blast radius'), 'blast');
    expect(inLabel.score).toBeGreaterThan(inKeywords.score);
  });

  it('treats a space in the query as a word boundary', () => {
    // "sim au" means "simulate auth". Without this, "Simulate API Gateway"
    // and "Simulate Auth Service" score identically and the tie breaks
    // alphabetically — never what the typist meant.
    const auth = matchCommand(command('Simulate Auth Service failure'), 'sim au');
    const api = matchCommand(command('Simulate API Gateway failure'), 'sim au');
    expect(auth).not.toBeNull();
    expect(auth.score).toBeGreaterThan(api.score);
  });

  it('requires the character after a space to begin a word', () => {
    // "go ce" must not match by landing mid-word.
    expect(matchCommand(command('Go to Command Center'), 'go ce')).not.toBeNull();
    expect(matchCommand(command('Government cell'), 'go xy')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(matchCommand(command('Go to Command Center'), 'GCC')).not.toBeNull();
  });

  it('reports where it matched inside the label', () => {
    const match = matchCommand(command('Radar'), 'rd');
    expect(match.indices).toEqual([0, 2]);
  });
});

describe('rankCommands', () => {
  const commands = [
    command('Go to Command Center', 'home dashboard'),
    command('Go to Investigation workspace', 'incident evidence'),
    command('Simulate Auth Service failure', 'blast radius'),
  ];

  it('puts the obvious answer first', () => {
    expect(rankCommands(commands, 'invest')[0].label).toMatch(/Investigation/);
    expect(rankCommands(commands, 'sim')[0].label).toMatch(/Simulate/);
  });

  it('returns everything for an empty query', () => {
    expect(rankCommands(commands, '')).toHaveLength(3);
  });

  it('drops commands that cannot match', () => {
    expect(rankCommands(commands, 'zzz')).toEqual([]);
  });

  it('sorts disabled commands last but keeps them', () => {
    // A palette where a command silently does not exist teaches someone
    // that the palette is unreliable.
    const withDisabled = [
      { ...command('Go to Investigation'), disabled: true, reason: 'No incident' },
      command('Go to Command Center'),
    ];
    const ranked = rankCommands(withDisabled, 'go');
    expect(ranked).toHaveLength(2);
    expect(ranked[1].disabled).toBe(true);
  });

  it('breaks ties alphabetically, so the order never jitters', () => {
    const ties = [command('Beta'), command('Alpha')];
    expect(rankCommands(ties, '').map((c) => c.label)).toEqual(['Alpha', 'Beta']);
  });

  it('handles being given nothing', () => {
    expect(rankCommands()).toEqual([]);
    expect(rankCommands([], 'x')).toEqual([]);
  });
});

describe('moveSelection', () => {
  it('wraps at both ends', () => {
    // Arrowing past the end and having nothing happen reads as broken.
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('moves normally in the middle', () => {
    expect(moveSelection(1, 1, 3)).toBe(2);
    expect(moveSelection(1, -1, 3)).toBe(0);
  });

  it('survives an empty list', () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
  });
});

describe('buildCommands', () => {
  it('offers navigation and a simulation per service', () => {
    const commands = buildCommands({
      services: [
        { id: 'auth', label: 'Auth Service' },
        { id: 'database', label: 'Database' },
      ],
    });
    expect(commands.filter((c) => c.group === 'Simulate')).toHaveLength(2);
    expect(commands.some((c) => c.id === 'nav.command-center')).toBe(true);
  });

  it('disables investigation with a reason when nothing is correlated', () => {
    const commands = buildCommands({ hasIncident: false });
    const investigate = commands.find((c) => c.id === 'nav.investigate');
    expect(investigate.disabled).toBe(true);
    expect(investigate.reason).toMatch(/no incident/i);
  });

  it('enables it once an incident exists', () => {
    const commands = buildCommands({ hasIncident: true });
    expect(commands.find((c) => c.id === 'nav.investigate').disabled).toBe(false);
  });

  it('wires each command to its handler', () => {
    const navigate = vi.fn();
    const onReset = vi.fn();
    const commands = buildCommands({ navigate, onReset, hasIncident: true });

    commands.find((c) => c.id === 'nav.investigate').run();
    expect(navigate).toHaveBeenCalledWith('/investigate');

    commands.find((c) => c.id === 'view.reset').run();
    expect(onReset).toHaveBeenCalled();
  });

  it('does not throw when a handler was not supplied', () => {
    const commands = buildCommands({});
    expect(() => commands.forEach((c) => c.run())).not.toThrow();
  });
});

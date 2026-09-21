/**
 * Command registry and matching.
 *
 * The palette's *behaviour* lives here, separately from its markup, for the
 * usual reason: ranking and filtering are where the bugs are, and they can
 * be tested by calling a function instead of typing into a rendered
 * dialog.
 *
 * Matching is subsequence-based rather than substring — "vrd" should find
 * "View threat radar", because that is how people actually type into a
 * palette. But a subsequence match alone ranks badly: "sr" matches both
 * "Show radar" and "Simulate auth service failure", and the first is
 * obviously the one meant. So the score rewards matches that start a word
 * and matches that are close together, which is what makes the first
 * result usually correct.
 */

/** A command that is not available right now is listed, disabled, with a reason. */
export function buildCommands(context = {}) {
  const { navigate, hasIncident, services = [], onSelectService, onReset } = context;

  return [
    {
      id: 'nav.command-center',
      label: 'Go to Command Center',
      group: 'Navigate',
      keywords: 'home dashboard overview',
      run: () => navigate?.('/'),
    },
    {
      id: 'nav.investigate',
      label: 'Go to Investigation workspace',
      group: 'Navigate',
      keywords: 'incident evidence chain forensics',
      disabled: !hasIncident,
      reason: 'No incident is currently correlated',
      run: () => navigate?.('/investigate'),
    },
    ...services.map((service) => ({
      id: `sim.${service.id}`,
      label: `Simulate ${service.label} failure`,
      group: 'Simulate',
      keywords: `blast radius impact outage ${service.id}`,
      run: () => onSelectService?.(service.id),
    })),
    {
      id: 'view.reset',
      label: 'Clear live state and start over',
      group: 'Session',
      keywords: 'reset clear restart empty',
      run: () => onReset?.(),
    },
  ];
}

function findWordStart(haystack, char, from) {
  let at = haystack.indexOf(char, from);
  while (at !== -1) {
    if (at === 0 || /[\s-]/.test(haystack[at - 1])) return at;
    at = haystack.indexOf(char, at + 1);
  }
  return -1;
}

/**
 * Subsequence match with a positional score.
 *
 * Returns `null` for no match, so a caller cannot accidentally treat a
 * zero score as a miss — a distinction that matters because an exact
 * prefix match on a one-letter query legitimately scores low.
 */
export function matchCommand(command, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return { score: 0, indices: [] };

  const haystack = `${command.label} ${command.keywords ?? ''}`.toLowerCase();
  const label = command.label.toLowerCase();

  let score = 0;
  let cursor = 0;
  let previous = -2;
  let first = true;
  // A space in the query is a word boundary, not a character to discard.
  // "sim au" means "simulate auth", so the character after the space has to
  // begin a word — otherwise "Simulate API Gateway" and "Simulate Auth
  // Service" score identically and the tie is broken alphabetically, which
  // is never what the typist meant.
  let requireWordStart = false;
  const indices = [];

  for (const char of q) {
    if (char === ' ') {
      requireWordStart = true;
      continue;
    }

    const found = requireWordStart
      ? findWordStart(haystack, char, cursor)
      : haystack.indexOf(char, cursor);
    if (found === -1) return null;
    requireWordStart = false;

    const startsWord = found === 0 || /[\s-]/.test(haystack[found - 1]);
    const adjacent = found === previous + 1;

    // Landing on a word start matters most for the *first* character —
    // that is the one a user aims at. After that, adjacency outranks it,
    // because "rad" should find "Radar view" rather than "Reset all data",
    // and the second only wins if word starts keep outscoring a real run
    // of consecutive characters.
    if (startsWord) score += first ? 8 : 4;
    if (adjacent) score += 6;
    // Matches in the label beat matches in the hidden keywords.
    if (found < label.length) score += 2;

    if (found < label.length) indices.push(found);
    previous = found;
    cursor = found + 1;
    first = false;
    score += 1;
  }

  return { score, indices };
}

/**
 * Rank commands for a query.
 *
 * Disabled commands are kept and shown with their reason rather than
 * hidden. A palette where a command silently does not exist teaches
 * someone that the palette is unreliable; one that says "no incident is
 * currently correlated" teaches them something true.
 */
export function rankCommands(commands = [], query = '') {
  return commands
    .map((command) => {
      const match = matchCommand(command, query);
      return match ? { ...command, score: match.score, indices: match.indices } : null;
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(a.disabled ?? false) - Number(b.disabled ?? false) ||
        b.score - a.score ||
        a.label.localeCompare(b.label)
    );
}

/**
 * Move a selection through a list, wrapping.
 *
 * Wrapping is deliberate: arrowing past the end of a short list and having
 * nothing happen reads as a broken palette, and the list is always short
 * enough that wrapping cannot disorient.
 */
export function moveSelection(index, delta, length) {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

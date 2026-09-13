/**
 * Severity badge.
 *
 * Severity is carried by three things at once — colour, a written label and
 * a shape — so the interface still works in greyscale, at a glance, and for
 * a reader who cannot distinguish the four hues. A badge that relies on
 * colour alone is a badge that fails the one time it matters.
 */

const GLYPH = {
  low: '▪',
  medium: '◆',
  high: '▲',
  critical: '⬢',
};

export function SeverityBadge({ severity = 'low', score, label }) {
  return (
    <span className={`sev sev--${severity}`}>
      <span className="sev-glyph" aria-hidden="true">{GLYPH[severity] ?? '▪'}</span>
      <span className="sev-label">{label ?? severity.toUpperCase()}</span>
      {Number.isFinite(score) && <span className="sev-score">{score}</span>}
    </span>
  );
}

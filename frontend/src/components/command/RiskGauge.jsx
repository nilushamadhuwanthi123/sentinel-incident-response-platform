/**
 * Risk gauge.
 *
 * A number with no explanation is not actionable, so this component refuses
 * to render one. The score, the band, the direction of travel and the
 * contributors that produced it are one unit — an analyst shown 88 CRITICAL
 * can see immediately which five signals put it there and how many points
 * each is worth.
 *
 * The arc is drawn from the score rather than animated toward it from
 * nowhere: the geometry is derived, so it cannot disagree with the number
 * printed beside it.
 */

import { SeverityBadge } from '../shared/SeverityBadge.jsx';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Three quarters of a circle, so the gauge reads as a dial, not a pie. */
const SWEEP = 0.75;

export function RiskGauge({ risk, delta }) {
  const score = Number.isFinite(risk?.score) ? risk.score : 0;
  const severity = risk?.severity ?? 'low';
  const contributors = risk?.contributors ?? [];

  const filled = CIRCUMFERENCE * SWEEP * (score / 100);
  const track = CIRCUMFERENCE * SWEEP;

  return (
    <div className="gauge">
      <div className="gauge-dial">
        <svg viewBox="0 0 140 140" role="img" aria-label={`Risk score ${score} of 100, ${severity}`}>
          <circle
            className="gauge-track"
            cx="70"
            cy="70"
            r={RADIUS}
            strokeDasharray={`${track} ${CIRCUMFERENCE}`}
            transform="rotate(135 70 70)"
          />
          <circle
            className={`gauge-fill gauge-fill--${severity}`}
            cx="70"
            cy="70"
            r={RADIUS}
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform="rotate(135 70 70)"
          />
        </svg>
        <div className="gauge-readout">
          <span className="gauge-score">{score}</span>
          <SeverityBadge severity={severity} label={risk?.label} />
          {Number.isFinite(delta) && delta !== 0 && (
            <span className={`gauge-delta gauge-delta--${delta > 0 ? 'up' : 'down'}`}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
            </span>
          )}
        </div>
      </div>

      {contributors.length > 0 ? (
        <ol className="gauge-contrib">
          {contributors.map((c) => (
            <li key={c.id} className="gauge-contrib-row">
              <span className="gauge-contrib-label">{c.label}</span>
              <span className="gauge-contrib-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (c.points / score) * 100 || 0)}%` }} />
              </span>
              <span className="gauge-contrib-points">+{c.points}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="gauge-empty">
          Nothing is currently contributing to risk. A score of zero means no
          recognised signals — not a judgement that the estate is safe.
        </p>
      )}
    </div>
  );
}

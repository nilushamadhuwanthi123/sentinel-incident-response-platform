/**
 * Connection badge.
 *
 * The most important component on the page, and the smallest. Everything
 * else shows numbers; this says whether those numbers are worth reading.
 *
 * It renders the *data* meaning, not the transport state — "showing the
 * last known state", never "socket disconnected" — and it is a live region,
 * because a viewer who has looked away needs to be told the feed went stale
 * without having to notice a colour change.
 */

import { CONNECTION } from '../../engines/connectionState.js';

const TONE_CLASS = {
  operational: 'ok',
  gold: 'warn',
  hazard: 'warn',
  critical: 'bad',
  muted: 'idle',
};

export function ConnectionBadge({ status, degraded }) {
  const tone = TONE_CLASS[status?.tone] ?? 'idle';
  const pulsing = status?.label === CONNECTION.LIVE;

  return (
    <div
      className={`conn conn--${tone}`}
      role="status"
      aria-live="polite"
      data-degraded={degraded ? 'true' : 'false'}
    >
      <span className={`conn-dot ${pulsing ? 'conn-dot--live' : ''}`} aria-hidden="true" />
      <span className="conn-label">{status?.label}</span>
      <span className="conn-detail">{status?.detail}</span>
    </div>
  );
}

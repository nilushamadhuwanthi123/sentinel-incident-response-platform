/**
 * The severity scale.
 *
 * Every engine in SENTINEL eventually produces a 0-100 number, and every
 * surface that shows one needs to agree on what that number means. Putting
 * the bands here — rather than letting each component pick its own
 * thresholds — is what stops the radar calling 74 "critical" while the
 * incident header calls the same number "high".
 */

export const SEVERITY_BANDS = Object.freeze([
  { id: 'low', label: 'LOW', min: 0, max: 24 },
  { id: 'medium', label: 'MEDIUM', min: 25, max: 49 },
  { id: 'high', label: 'HIGH', min: 50, max: 74 },
  { id: 'critical', label: 'CRITICAL', min: 75, max: 100 },
]);

/** Lowest score that still counts as critical. Used by command-mode entry. */
export const CRITICAL_THRESHOLD = 75;

/**
 * Clamp an arbitrary number into the 0-100 scale.
 *
 * Scores reach this function from weighted sums, simulations and socket
 * payloads, so it has to survive values that are out of range, negative,
 * NaN or not a number at all. Returning 0 for unusable input is deliberate:
 * a missing score must never present as a calm 50, and must never throw
 * inside a render.
 */
export function clampScore(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/** The band a score falls into. Always returns a band, never undefined. */
export function bandForScore(value) {
  const score = clampScore(value);
  return (
    SEVERITY_BANDS.find((b) => score >= b.min && score <= b.max) ??
    SEVERITY_BANDS[0]
  );
}

/** Band id only — the common case, and what CSS modifiers are keyed on. */
export function severityOf(value) {
  return bandForScore(value).id;
}

/** Human label for a score, e.g. 88 -> "CRITICAL". */
export function severityLabel(value) {
  return bandForScore(value).label;
}

/** True when a score is in the band that triggers Incident Command Mode. */
export function isCritical(value) {
  return clampScore(value) >= CRITICAL_THRESHOLD;
}

/**
 * Describe a change between two scores, for risk trajectory and
 * simulation views. `direction` is intentionally separate from the sign of
 * `delta` so callers can style "improving" without re-deriving it.
 */
export function describeDelta(from, to) {
  const a = clampScore(from);
  const b = clampScore(to);
  const delta = b - a;
  return {
    from: a,
    to: b,
    delta,
    direction: delta === 0 ? 'flat' : delta > 0 ? 'escalating' : 'improving',
    fromSeverity: severityOf(a),
    toSeverity: severityOf(b),
    crossedIntoCritical: !isCritical(a) && isCritical(b),
    leftCritical: isCritical(a) && !isCritical(b),
  };
}

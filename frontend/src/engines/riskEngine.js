import { clampScore, severityLabel, severityOf } from './severity.js';

/**
 * The explainable risk engine.
 *
 *   risk = likelihood x 0.40 + impact x 0.35 + exposure x 0.25
 *
 * A number on its own is not actionable. An analyst shown "88 CRITICAL" can
 * do nothing with it unless they can also see what pushed it there and what
 * would bring it down. So this engine returns its own reasoning: the
 * individual signals that raised the score, with point values that actually
 * add up to it, and the defensive actions that reduced it.
 *
 * It is a pure function. No React, no DOM, no network, no reads of live
 * state. That is what lets the what-if simulator re-run this exact function
 * against a hypothetical incident without touching the real one.
 */

export const FACTOR_WEIGHTS = Object.freeze({
  likelihood: 0.4,
  impact: 0.35,
  exposure: 0.25,
});

/**
 * What the platform can actually observe, and what each observation says
 * about likelihood, impact and exposure.
 *
 * These are operational judgements, not measurements, and they are written
 * down here — in one table — rather than scattered through components, so
 * that they can be argued with, tuned and tested.
 */
export const SIGNAL_CATALOG = Object.freeze({
  REPEATED_AUTH_FAILURE: {
    label: 'Repeated failed authentication',
    likelihood: 26,
    impact: 4,
    exposure: 6,
    /** Scales with the observed count, up to a ceiling. */
    scalable: true,
  },
  UNKNOWN_EXTERNAL_IP: {
    label: 'Unknown external IP',
    likelihood: 22,
    impact: 6,
    exposure: 24,
  },
  PRIVILEGED_ACCOUNT: {
    label: 'Privileged account involved',
    likelihood: 10,
    impact: 34,
    exposure: 18,
  },
  SENSITIVE_RESOURCE_ACCESS: {
    label: 'Sensitive resource accessed',
    likelihood: 8,
    impact: 32,
    exposure: 22,
  },
  DATA_STORE_REACHED: {
    label: 'Data store reached',
    likelihood: 4,
    impact: 30,
    exposure: 14,
  },
  PRIVILEGE_ESCALATION: {
    label: 'Privilege escalation observed',
    likelihood: 18,
    impact: 28,
    exposure: 12,
  },
  MULTI_SERVICE_SPREAD: {
    label: 'Activity spans multiple services',
    likelihood: 8,
    impact: 22,
    exposure: 16,
  },
  PUBLIC_FACING_SERVICE: {
    label: 'Internet-facing service',
    likelihood: 6,
    impact: 8,
    exposure: 28,
  },
  OFF_HOURS_ACTIVITY: {
    label: 'Activity outside normal hours',
    likelihood: 14,
    impact: 2,
    exposure: 4,
  },
  MFA_ABSENT: {
    label: 'No second factor on the identity',
    likelihood: 16,
    impact: 8,
    exposure: 18,
  },
  RAPID_EVENT_BURST: {
    label: 'Event rate far above baseline',
    likelihood: 20,
    impact: 8,
    exposure: 6,
  },
});

/**
 * Defensive actions and what each is worth.
 *
 * `reduces` is expressed per factor, not as a flat score cut, because
 * locking an account genuinely changes the likelihood of continued
 * compromise without changing how sensitive the data it reached was.
 */
export const RESPONSE_CATALOG = Object.freeze({
  LOCK_ACCOUNT: {
    label: 'Lock the affected account',
    reduces: { likelihood: 46, impact: 6, exposure: 12 },
    reversible: true,
    serviceImpact: 'low',
    confidence: 'high',
  },
  BLOCK_SOURCE_IP: {
    label: 'Block the source address',
    reduces: { likelihood: 30, impact: 2, exposure: 38 },
    reversible: true,
    serviceImpact: 'low',
    confidence: 'high',
  },
  REVOKE_SESSIONS: {
    label: 'Revoke active sessions',
    reduces: { likelihood: 28, impact: 12, exposure: 14 },
    reversible: false,
    serviceImpact: 'medium',
    confidence: 'high',
  },
  ROTATE_CREDENTIALS: {
    label: 'Rotate affected credentials',
    reduces: { likelihood: 22, impact: 16, exposure: 20 },
    reversible: false,
    serviceImpact: 'medium',
    confidence: 'medium',
  },
  ISOLATE_SERVICE: {
    label: 'Isolate the affected service',
    reduces: { likelihood: 18, impact: 34, exposure: 30 },
    reversible: true,
    serviceImpact: 'high',
    confidence: 'high',
  },
  ENFORCE_MFA: {
    label: 'Enforce second factor',
    reduces: { likelihood: 20, impact: 4, exposure: 16 },
    reversible: true,
    serviceImpact: 'low',
    confidence: 'medium',
  },
});

const FACTOR_KEYS = ['likelihood', 'impact', 'exposure'];

/** Clamp a factor to 0-100, treating unusable input as 0 rather than guessing. */
function clampFactor(value) {
  return clampScore(value);
}

/** The weighted 0-100 score for a set of factors. */
function weigh(factors) {
  return (
    factors.likelihood * FACTOR_WEIGHTS.likelihood +
    factors.impact * FACTOR_WEIGHTS.impact +
    factors.exposure * FACTOR_WEIGHTS.exposure
  );
}

/**
 * Resolve one signal into its point values.
 *
 * A signal may be a bare id, or an object carrying a `count` (for scalable
 * signals such as repeated authentication failure) or explicit `weights`
 * that override the catalogue. Unknown ids are dropped rather than guessed
 * at — an engine that invents a weight for something it does not recognise
 * is worse than one that admits it saw nothing.
 */
function resolveSignal(signal) {
  const id = typeof signal === 'string' ? signal : signal?.id;
  const entry = SIGNAL_CATALOG[id];
  if (!entry) return null;

  const weights = FACTOR_KEYS.reduce((acc, key) => {
    acc[key] = signal?.weights?.[key] ?? entry[key] ?? 0;
    return acc;
  }, {});

  // A scalable signal grows with the observed count but saturates: the
  // difference between 27 and 270 failed logins is not ten times the risk.
  if (entry.scalable && typeof signal?.count === 'number' && signal.count > 1) {
    const growth = Math.min(1.6, 1 + Math.log10(signal.count) / 2);
    FACTOR_KEYS.forEach((key) => {
      weights[key] = Math.round(weights[key] * growth);
    });
  }

  return {
    id,
    label: signal?.label ?? entry.label,
    count: typeof signal?.count === 'number' ? signal.count : undefined,
    weights,
    weighted: weigh(weights),
  };
}

/** Derive the three factors from observed signals. */
function deriveFactors(resolvedSignals) {
  const totals = { likelihood: 0, impact: 0, exposure: 0 };
  resolvedSignals.forEach((s) => {
    FACTOR_KEYS.forEach((key) => {
      totals[key] += s.weights[key];
    });
  });
  return {
    likelihood: clampFactor(totals.likelihood),
    impact: clampFactor(totals.impact),
    exposure: clampFactor(totals.exposure),
  };
}

/** Resolve completed responses into per-factor reductions. */
function resolveResponses(responses) {
  return responses
    .map((r) => {
      const id = typeof r === 'string' ? r : r?.id;
      const entry = RESPONSE_CATALOG[id];
      if (!entry) return null;
      return { id, label: r?.label ?? entry.label, ...entry };
    })
    .filter(Boolean);
}

/**
 * Compute risk, with the reasoning behind it.
 *
 * @param {object} input
 * @param {Array} [input.signals]    observed signals raising risk
 * @param {Array} [input.responses]  completed defensive actions
 * @param {number} [input.likelihood] explicit factor, overrides derivation
 * @param {number} [input.impact]
 * @param {number} [input.exposure]
 */
export function computeRisk(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const responses = Array.isArray(input.responses) ? input.responses : [];

  const resolvedSignals = signals.map(resolveSignal).filter(Boolean);
  const resolvedResponses = resolveResponses(responses);

  // Explicit factors win. An incident that arrives from the server with
  // assessed factors should not be silently re-derived by the client.
  const usedExplicitFactors = FACTOR_KEYS.some(
    (key) => input[key] !== undefined && input[key] !== null
  );

  const derived = deriveFactors(resolvedSignals);
  const baseFactors = usedExplicitFactors
    ? {
        likelihood: clampFactor(input.likelihood ?? derived.likelihood),
        impact: clampFactor(input.impact ?? derived.impact),
        exposure: clampFactor(input.exposure ?? derived.exposure),
      }
    : derived;

  const baseScore = clampScore(weigh(baseFactors));

  // Attribute the base score across the signals that produced it.
  // Scaling by the clamp ratio keeps the explanation arithmetically true:
  // the contributor points a reader adds up genuinely reach the score,
  // rather than overshooting it because a factor hit its ceiling.
  const nominalTotal = resolvedSignals.reduce((sum, s) => sum + s.weighted, 0);
  const attributionRatio =
    nominalTotal > 0 ? Math.min(1, baseScore / nominalTotal) : 0;
  const attributionScaled = nominalTotal > 0 && attributionRatio < 1;

  const contributors = resolvedSignals
    .map((s) => ({
      id: s.id,
      label: s.label,
      count: s.count,
      points: Math.round(s.weighted * attributionRatio),
      nominalPoints: Math.round(s.weighted),
      weights: s.weights,
    }))
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points);

  // Reductions are applied to the factors, then re-weighed, so that an
  // action's value depends on what the factor was actually worth.
  const reducedFactors = { ...baseFactors };
  const reducers = resolvedResponses.map((r) => {
    const before = weigh(reducedFactors);
    FACTOR_KEYS.forEach((key) => {
      reducedFactors[key] = clampFactor(
        reducedFactors[key] - (r.reduces[key] ?? 0)
      );
    });
    const after = weigh(reducedFactors);
    return {
      id: r.id,
      label: r.label,
      points: -Math.round(before - after),
      reversible: r.reversible,
      serviceImpact: r.serviceImpact,
      confidence: r.confidence,
    };
  });

  const score = clampScore(weigh(reducedFactors));
  const totalReduction = baseScore - score;

  return {
    score,
    severity: severityOf(score),
    label: severityLabel(score),

    baseScore,
    baseSeverity: severityOf(baseScore),
    totalReduction,

    factors: {
      likelihood: {
        value: reducedFactors.likelihood,
        base: baseFactors.likelihood,
        weight: FACTOR_WEIGHTS.likelihood,
      },
      impact: {
        value: reducedFactors.impact,
        base: baseFactors.impact,
        weight: FACTOR_WEIGHTS.impact,
      },
      exposure: {
        value: reducedFactors.exposure,
        base: baseFactors.exposure,
        weight: FACTOR_WEIGHTS.exposure,
      },
    },

    contributors,
    reducers: reducers.filter((r) => r.points !== 0),

    explanation: {
      factorsWereDerived: !usedExplicitFactors,
      attributionScaled,
      unrecognisedSignals: signals.length - resolvedSignals.length,
      unrecognisedResponses: responses.length - resolvedResponses.length,
    },
  };
}

/**
 * Risk trajectory: the same engine applied to an ordered sequence of
 * observations, so an analyst can see exactly when risk moved and why.
 */
export function computeTrajectory(points = []) {
  let previous = null;
  return points.map((point) => {
    const result = computeRisk(point);
    const entry = {
      at: point.at ?? null,
      score: result.score,
      severity: result.severity,
      label: result.label,
      delta: previous === null ? 0 : result.score - previous,
      contributors: result.contributors,
      reducers: result.reducers,
    };
    previous = result.score;
    return entry;
  });
}

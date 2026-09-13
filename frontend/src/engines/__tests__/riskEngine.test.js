import { describe, expect, it } from 'vitest';
import {
  FACTOR_WEIGHTS,
  RESPONSE_CATALOG,
  SIGNAL_CATALOG,
  computeRisk,
  computeTrajectory,
} from '../riskEngine.js';

const CREDENTIAL_ATTACK_SIGNALS = [
  { id: 'REPEATED_AUTH_FAILURE', count: 27 },
  'UNKNOWN_EXTERNAL_IP',
  'PRIVILEGED_ACCOUNT',
  'SENSITIVE_RESOURCE_ACCESS',
];

describe('weighting', () => {
  it('applies the specified weights', () => {
    expect(FACTOR_WEIGHTS.likelihood).toBe(0.4);
    expect(FACTOR_WEIGHTS.impact).toBe(0.35);
    expect(FACTOR_WEIGHTS.exposure).toBe(0.25);
    expect(
      FACTOR_WEIGHTS.likelihood + FACTOR_WEIGHTS.impact + FACTOR_WEIGHTS.exposure
    ).toBeCloseTo(1);
  });

  it('computes the weighted score from explicit factors', () => {
    // 80 * 0.40 + 60 * 0.35 + 40 * 0.25 = 32 + 21 + 10 = 63
    const r = computeRisk({ likelihood: 80, impact: 60, exposure: 40 });
    expect(r.score).toBe(63);
    expect(r.severity).toBe('high');
  });

  it('weights likelihood most heavily', () => {
    const l = computeRisk({ likelihood: 100, impact: 0, exposure: 0 }).score;
    const i = computeRisk({ likelihood: 0, impact: 100, exposure: 0 }).score;
    const e = computeRisk({ likelihood: 0, impact: 0, exposure: 100 }).score;
    expect(l).toBeGreaterThan(i);
    expect(i).toBeGreaterThan(e);
  });

  it('prefers explicit factors over derived ones', () => {
    const r = computeRisk({
      likelihood: 10,
      impact: 10,
      exposure: 10,
      signals: CREDENTIAL_ATTACK_SIGNALS,
    });
    expect(r.score).toBe(10);
    expect(r.explanation.factorsWereDerived).toBe(false);
  });
});

describe('severity boundaries', () => {
  it.each([
    [0, 'low'],
    [24, 'low'],
    [25, 'medium'],
    [49, 'medium'],
    [50, 'high'],
    [74, 'high'],
    [75, 'critical'],
    [100, 'critical'],
  ])('a score of %i is %s', (target, expected) => {
    // Feed the target through every factor so the weighted result is exactly it.
    const r = computeRisk({
      likelihood: target,
      impact: target,
      exposure: target,
    });
    expect(r.score).toBe(target);
    expect(r.severity).toBe(expected);
  });
});

describe('deriving factors from signals', () => {
  it('derives all three factors and marks them as derived', () => {
    const r = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    expect(r.explanation.factorsWereDerived).toBe(true);
    expect(r.factors.likelihood.base).toBeGreaterThan(0);
    expect(r.factors.impact.base).toBeGreaterThan(0);
    expect(r.factors.exposure.base).toBeGreaterThan(0);
  });

  it('reaches the critical band for a full credential attack', () => {
    const r = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    expect(r.severity).toBe('critical');
  });

  it('stays low for a single benign signal', () => {
    const r = computeRisk({ signals: ['OFF_HOURS_ACTIVITY'] });
    expect(r.severity).toBe('low');
  });

  it('scales a scalable signal with its count, but saturates', () => {
    const one = computeRisk({
      signals: [{ id: 'REPEATED_AUTH_FAILURE', count: 1 }],
    }).score;
    const many = computeRisk({
      signals: [{ id: 'REPEATED_AUTH_FAILURE', count: 27 }],
    }).score;
    const absurd = computeRisk({
      signals: [{ id: 'REPEATED_AUTH_FAILURE', count: 27000 }],
    }).score;

    expect(many).toBeGreaterThan(one);
    // Saturation: a thousand times the events is not a thousand times the risk.
    expect(absurd).toBeLessThan(many * 2);
  });

  it('ignores unrecognised signals rather than inventing a weight', () => {
    const known = computeRisk({ signals: ['PRIVILEGED_ACCOUNT'] });
    const withJunk = computeRisk({
      signals: ['PRIVILEGED_ACCOUNT', 'NOT_A_REAL_SIGNAL'],
    });
    expect(withJunk.score).toBe(known.score);
    expect(withJunk.explanation.unrecognisedSignals).toBe(1);
  });
});

describe('risk contributors', () => {
  it('lists contributors ordered by how much they contributed', () => {
    const { contributors } = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    expect(contributors.length).toBeGreaterThan(1);
    for (let i = 1; i < contributors.length; i += 1) {
      expect(contributors[i - 1].points).toBeGreaterThanOrEqual(
        contributors[i].points
      );
    }
  });

  it('contributor points add up to the base score, so the explanation is true', () => {
    const r = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    const sum = r.contributors.reduce((t, c) => t + c.points, 0);
    // Rounding each contributor can move the total by at most half a point
    // per contributor; anything beyond that would mean the breakdown lies.
    expect(Math.abs(sum - r.baseScore)).toBeLessThanOrEqual(
      Math.ceil(r.contributors.length / 2)
    );
  });

  it('flags when attribution had to be scaled because a factor saturated', () => {
    const r = computeRisk({ signals: Object.keys(SIGNAL_CATALOG) });
    expect(r.explanation.attributionScaled).toBe(true);
  });

  it('returns no contributors when there are no signals', () => {
    expect(computeRisk({ likelihood: 50 }).contributors).toEqual([]);
  });
});

describe('risk reducers', () => {
  it('lowers the score when a defensive action is completed', () => {
    const before = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    const after = computeRisk({
      signals: CREDENTIAL_ATTACK_SIGNALS,
      responses: ['LOCK_ACCOUNT'],
    });
    expect(after.score).toBeLessThan(before.score);
    expect(after.totalReduction).toBeGreaterThan(0);
  });

  it('reports each reducer with a negative point value', () => {
    const r = computeRisk({
      signals: CREDENTIAL_ATTACK_SIGNALS,
      responses: ['LOCK_ACCOUNT', 'BLOCK_SOURCE_IP'],
    });
    expect(r.reducers).toHaveLength(2);
    r.reducers.forEach((reducer) => {
      expect(reducer.points).toBeLessThan(0);
      expect(reducer.label).toEqual(expect.any(String));
    });
  });

  it('combined actions reduce risk further than either alone', () => {
    const base = { signals: CREDENTIAL_ATTACK_SIGNALS };
    const lock = computeRisk({ ...base, responses: ['LOCK_ACCOUNT'] }).score;
    const block = computeRisk({ ...base, responses: ['BLOCK_SOURCE_IP'] }).score;
    const both = computeRisk({
      ...base,
      responses: ['LOCK_ACCOUNT', 'BLOCK_SOURCE_IP'],
    }).score;

    expect(both).toBeLessThanOrEqual(Math.min(lock, block));
  });

  it('can bring a critical incident out of the critical band', () => {
    const before = computeRisk({ signals: CREDENTIAL_ATTACK_SIGNALS });
    const after = computeRisk({
      signals: CREDENTIAL_ATTACK_SIGNALS,
      responses: ['LOCK_ACCOUNT', 'BLOCK_SOURCE_IP', 'REVOKE_SESSIONS'],
    });
    expect(before.severity).toBe('critical');
    expect(after.severity).not.toBe('critical');
  });

  it('never drives the score below zero', () => {
    const r = computeRisk({
      signals: ['OFF_HOURS_ACTIVITY'],
      responses: Object.keys(RESPONSE_CATALOG),
    });
    expect(r.score).toBe(0);
  });

  it('ignores unrecognised responses', () => {
    const r = computeRisk({
      signals: CREDENTIAL_ATTACK_SIGNALS,
      responses: ['NOT_A_REAL_ACTION'],
    });
    expect(r.reducers).toEqual([]);
    expect(r.explanation.unrecognisedResponses).toBe(1);
  });
});

describe('invalid input', () => {
  it('returns a usable result for no input at all', () => {
    const r = computeRisk();
    expect(r.score).toBe(0);
    expect(r.severity).toBe('low');
    expect(r.contributors).toEqual([]);
  });

  it('clamps out-of-range factors instead of trusting them', () => {
    const r = computeRisk({ likelihood: 500, impact: -80, exposure: 40 });
    expect(r.factors.likelihood.base).toBe(100);
    expect(r.factors.impact.base).toBe(0);
    expect(r.score).toBe(50); // 100*0.40 + 0*0.35 + 40*0.25
  });

  it('treats unusable factor values as zero rather than throwing', () => {
    expect(() =>
      computeRisk({ likelihood: NaN, impact: 'high', exposure: null })
    ).not.toThrow();
    expect(computeRisk({ likelihood: NaN, impact: 'high' }).score).toBe(0);
  });

  it('survives signals and responses that are not arrays', () => {
    expect(() =>
      computeRisk({ signals: 'PRIVILEGED_ACCOUNT', responses: 42 })
    ).not.toThrow();
  });

  it('never returns a score outside 0-100', () => {
    const r = computeRisk({ signals: Object.keys(SIGNAL_CATALOG) });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = {
      signals: [{ id: 'REPEATED_AUTH_FAILURE', count: 27 }],
      responses: ['LOCK_ACCOUNT'],
      likelihood: 70,
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    computeRisk(input);
    expect(input).toEqual(snapshot);
  });

  it('is deterministic', () => {
    const input = { signals: CREDENTIAL_ATTACK_SIGNALS };
    expect(computeRisk(input)).toEqual(computeRisk(input));
  });
});

describe('computeTrajectory', () => {
  it('reports the score at each point and the movement between them', () => {
    const t = computeTrajectory([
      { at: '09:41', signals: ['OFF_HOURS_ACTIVITY'] },
      { at: '09:43', signals: ['OFF_HOURS_ACTIVITY', 'UNKNOWN_EXTERNAL_IP'] },
      { at: '09:47', signals: CREDENTIAL_ATTACK_SIGNALS },
      {
        at: '09:56',
        signals: CREDENTIAL_ATTACK_SIGNALS,
        responses: ['LOCK_ACCOUNT', 'BLOCK_SOURCE_IP'],
      },
    ]);

    expect(t).toHaveLength(4);
    expect(t[0].delta).toBe(0);
    expect(t[1].delta).toBeGreaterThan(0);
    expect(t[2].severity).toBe('critical');
    expect(t[3].delta).toBeLessThan(0);
    expect(t.map((p) => p.at)).toEqual(['09:41', '09:43', '09:47', '09:56']);
  });

  it('returns an empty trajectory for no points', () => {
    expect(computeTrajectory()).toEqual([]);
  });
});

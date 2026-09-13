import { describe, expect, it } from 'vitest';
import {
  CRITICAL_THRESHOLD,
  SEVERITY_BANDS,
  bandForScore,
  clampScore,
  describeDelta,
  isCritical,
  severityLabel,
  severityOf,
} from '../severity.js';

describe('clampScore', () => {
  it('keeps a valid score', () => {
    expect(clampScore(61)).toBe(61);
  });

  it('rounds fractional scores', () => {
    expect(clampScore(61.4)).toBe(61);
    expect(clampScore(61.6)).toBe(62);
  });

  it('clamps out-of-range values instead of trusting them', () => {
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-30)).toBe(0);
  });

  it('returns 0 rather than a misleading mid-scale value for bad input', () => {
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(undefined)).toBe(0);
    expect(clampScore(null)).toBe(0);
    expect(clampScore('not a number')).toBe(0);
    expect(clampScore(Infinity)).toBe(0);
  });

  it('accepts numeric strings, which is what socket payloads often carry', () => {
    expect(clampScore('88')).toBe(88);
  });
});

describe('severity bands', () => {
  it('covers the whole 0-100 scale with no gaps or overlaps', () => {
    for (let score = 0; score <= 100; score += 1) {
      const matches = SEVERITY_BANDS.filter(
        (b) => score >= b.min && score <= b.max
      );
      expect(matches).toHaveLength(1);
    }
  });

  it.each([
    [0, 'low'],
    [24, 'low'],
    [25, 'medium'],
    [49, 'medium'],
    [50, 'high'],
    [74, 'high'],
    [75, 'critical'],
    [100, 'critical'],
  ])('maps %i to %s', (score, expected) => {
    expect(severityOf(score)).toBe(expected);
  });

  it('labels a score', () => {
    expect(severityLabel(88)).toBe('CRITICAL');
  });

  it('always returns a band, even for unusable input', () => {
    expect(bandForScore('rubbish').id).toBe('low');
  });
});

describe('isCritical', () => {
  it('is inclusive of the threshold', () => {
    expect(isCritical(CRITICAL_THRESHOLD - 1)).toBe(false);
    expect(isCritical(CRITICAL_THRESHOLD)).toBe(true);
  });
});

describe('describeDelta', () => {
  it('reports an escalation and the band crossing', () => {
    const d = describeDelta(61, 88);
    expect(d.delta).toBe(27);
    expect(d.direction).toBe('escalating');
    expect(d.fromSeverity).toBe('high');
    expect(d.toSeverity).toBe('critical');
    expect(d.crossedIntoCritical).toBe(true);
    expect(d.leftCritical).toBe(false);
  });

  it('reports containment leaving the critical band', () => {
    const d = describeDelta(88, 29);
    expect(d.delta).toBe(-59);
    expect(d.direction).toBe('improving');
    expect(d.leftCritical).toBe(true);
    expect(d.crossedIntoCritical).toBe(false);
  });

  it('reports no movement as flat', () => {
    expect(describeDelta(40, 40).direction).toBe('flat');
  });

  it('clamps both ends before comparing', () => {
    const d = describeDelta(-20, 500);
    expect(d.from).toBe(0);
    expect(d.to).toBe(100);
  });
});

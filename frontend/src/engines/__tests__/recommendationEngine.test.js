import { describe, expect, it } from 'vitest';
import {
  APPLICABILITY,
  CONFIDENCE_WEIGHT,
  SERVICE_IMPACT_COST,
  evaluateResponse,
  recommendResponses,
  simulateResponses,
} from '../recommendationEngine.js';
import { RESPONSE_CATALOG, computeRisk } from '../riskEngine.js';

/** The demo incident: a credential attack two steps from the database. */
const incident = () => ({
  signals: [
    { id: 'REPEATED_AUTH_FAILURE', count: 27 },
    'UNKNOWN_EXTERNAL_IP',
    'PRIVILEGED_ACCOUNT',
    'PRIVILEGE_ESCALATION',
    'SENSITIVE_RESOURCE_ACCESS',
    'MFA_ABSENT',
    'MULTI_SERVICE_SPREAD',
    'RAPID_EVENT_BURST',
  ],
});

describe('evaluateResponse', () => {
  it('reports the risk an action removes, taken from the risk engine', () => {
    // Not a second opinion about what an action is worth: the same engine,
    // run with and without it. Two places deciding this is two places to
    // be inconsistent.
    const context = incident();
    const evaluated = evaluateResponse('LOCK_ACCOUNT', context);
    const before = computeRisk(context).score;
    const after = computeRisk({ ...context, responses: [{ id: 'LOCK_ACCOUNT' }] }).score;
    expect(evaluated.reduction).toBe(before - after);
    expect(evaluated.projectedScore).toBe(after);
  });

  it('names the observed signals an action actually addresses', () => {
    const evaluated = evaluateResponse('ENFORCE_MFA', incident());
    expect(evaluated.addresses).toContain('MFA_ABSENT');
    expect(evaluated.applicable).toBe(true);
  });

  it('marks an action inapplicable when nothing observed calls for it', () => {
    const evaluated = evaluateResponse('ENFORCE_MFA', {
      signals: ['DATA_STORE_REACHED'],
    });
    expect(evaluated.applicable).toBe(false);
    expect(evaluated.addresses).toEqual([]);
  });

  it('carries the cost, not only the benefit', () => {
    const isolate = evaluateResponse('ISOLATE_SERVICE', incident());
    expect(isolate.serviceImpact).toBe('high');
    expect(isolate.reversible).toBe(true);

    const rotate = evaluateResponse('ROTATE_CREDENTIALS', incident());
    expect(rotate.reversible).toBe(false);
  });

  it('says when an action leaves risk critical', () => {
    // The difference between a fix and a first step. An interface that does
    // not distinguish them invites someone to stop after one action.
    const evaluated = evaluateResponse('ENFORCE_MFA', incident());
    expect(evaluated.leavesCritical).toBe(true);
  });

  it('penalises an irreversible action against an equal reversible one', () => {
    // Not a veto — rotating credentials is sometimes exactly right. It just
    // has to be worth more to rank above something that can be undone.
    const reversible = evaluateResponse('LOCK_ACCOUNT', incident());
    const irreversible = evaluateResponse('ROTATE_CREDENTIALS', incident());
    const perPoint = (r) => r.value / (r.reduction || 1);
    expect(perPoint(irreversible)).toBeLessThan(perPoint(reversible));
  });

  it('returns null for an action the catalogue does not have', () => {
    expect(evaluateResponse('DELETE_EVERYTHING', incident())).toBeNull();
  });

  it('handles an empty context without inventing risk', () => {
    const evaluated = evaluateResponse('LOCK_ACCOUNT', {});
    expect(evaluated.reduction).toBe(0);
    expect(evaluated.applicable).toBe(false);
  });
});

describe('recommendResponses', () => {
  it('ranks by value removed per unit of disruption', () => {
    const { recommendations } = recommendResponses(incident());
    const values = recommendations.map((r) => r.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('excludes inapplicable actions rather than ranking them last', () => {
    // A list that always has six entries teaches an analyst to stop reading
    // it.
    const { recommendations } = recommendResponses({
      signals: ['UNKNOWN_EXTERNAL_IP'],
    });
    expect(recommendations.every((r) => r.applicable)).toBe(true);
    expect(recommendations.length).toBeLessThan(
      Object.keys(RESPONSE_CATALOG).length
    );
  });

  it('recommends nothing when there is nothing to respond to', () => {
    const result = recommendResponses({ signals: [] });
    expect(result.recommendations).toEqual([]);
    expect(result.rationale).toBeNull();
    expect(result.excluded).toBe(result.considered);
  });

  it('explains its first choice in words', () => {
    // A ranked list with no stated reason is an oracle.
    const { rationale } = recommendResponses(incident());
    expect(rationale).toMatch(/removes \d+ points/);
    expect(rationale).toMatch(/undone/);
  });

  it('says when the top action is a first step rather than a fix', () => {
    const { rationale } = recommendResponses(incident());
    expect(rationale).toMatch(/first step, not a fix/);
  });

  it('honours a limit', () => {
    expect(recommendResponses(incident(), { limit: 2 }).recommendations).toHaveLength(2);
  });

  it('is deterministic', () => {
    expect(recommendResponses(incident())).toEqual(recommendResponses(incident()));
  });

  it('does not mutate the context it was given', () => {
    const context = incident();
    const snapshot = JSON.parse(JSON.stringify(context));
    recommendResponses(context);
    expect(context).toEqual(snapshot);
  });
});

describe('simulateResponses', () => {
  it('is the same calculation as the live view, marked as a projection', () => {
    const context = incident();
    const sim = simulateResponses(context, ['LOCK_ACCOUNT']);
    const real = computeRisk({ ...context, responses: [{ id: 'LOCK_ACCOUNT' }] });
    expect(sim.after.score).toBe(real.score);
    expect(sim.simulated).toBe(true);
  });

  it('shows a running total rather than pretending reductions add up', () => {
    // Two actions that both lower likelihood do not simply add. Presenting
    // them as if they did would overstate the combination, which is the
    // exact mistake that gets an analyst to stop too early.
    const sim = simulateResponses(incident(), ['LOCK_ACCOUNT', 'BLOCK_SOURCE_IP']);
    expect(sim.steps).toHaveLength(2);
    expect(sim.steps[0].to).toBe(sim.steps[1].from);
    expect(sim.steps[1].to).toBe(sim.after.score);

    const summed = sim.steps.reduce((t, s) => t + Math.abs(s.delta), 0);
    const combined = Math.abs(sim.delta);
    expect(combined).toBeLessThanOrEqual(summed);
  });

  it('never claims a combination lowers risk below zero', () => {
    const sim = simulateResponses(incident(), Object.keys(RESPONSE_CATALOG));
    expect(sim.after.score).toBeGreaterThanOrEqual(0);
  });

  it('names the irreversible and the disruptive actions separately', () => {
    // Two different kinds of cost. Collapsing them hides the distinction an
    // analyst is actually weighing.
    const sim = simulateResponses(incident(), [
      'ROTATE_CREDENTIALS',
      'ISOLATE_SERVICE',
      'LOCK_ACCOUNT',
    ]);
    expect(sim.irreversible).toEqual(['ROTATE_CREDENTIALS']);
    expect(sim.disruptive).toEqual(['ISOLATE_SERVICE']);
  });

  it('reports whether risk is still critical afterwards', () => {
    const one = simulateResponses(incident(), ['ENFORCE_MFA']);
    const many = simulateResponses(incident(), [
      'LOCK_ACCOUNT',
      'BLOCK_SOURCE_IP',
      'REVOKE_SESSIONS',
      'ISOLATE_SERVICE',
    ]);
    expect(one.stillCritical).toBe(true);
    expect(many.after.score).toBeLessThan(one.after.score);
  });

  it('reports unknown actions instead of silently dropping them', () => {
    const sim = simulateResponses(incident(), ['LOCK_ACCOUNT', 'MAKE_IT_STOP']);
    expect(sim.unknown).toEqual(['MAKE_IT_STOP']);
    expect(sim.steps).toHaveLength(1);
  });

  it('handles no actions at all', () => {
    const sim = simulateResponses(incident(), []);
    expect(sim.delta).toBe(0);
    expect(sim.steps).toEqual([]);
  });

  it('does not mutate the context', () => {
    const context = incident();
    const snapshot = JSON.parse(JSON.stringify(context));
    simulateResponses(context, ['LOCK_ACCOUNT', 'ISOLATE_SERVICE']);
    expect(context).toEqual(snapshot);
  });
});

describe('catalogue integrity', () => {
  it('gives every response an applicability rule', () => {
    // A response with no rule can never be recommended, which would be a
    // silent no-op rather than an error.
    Object.keys(RESPONSE_CATALOG).forEach((id) => {
      expect(APPLICABILITY[id], `${id} has no applicability rule`).toBeDefined();
      expect(APPLICABILITY[id].length).toBeGreaterThan(0);
    });
  });

  it('gives every service impact and confidence level a cost', () => {
    Object.values(RESPONSE_CATALOG).forEach((entry) => {
      expect(SERVICE_IMPACT_COST[entry.serviceImpact]).toBeDefined();
      expect(CONFIDENCE_WEIGHT[entry.confidence]).toBeDefined();
    });
  });
});

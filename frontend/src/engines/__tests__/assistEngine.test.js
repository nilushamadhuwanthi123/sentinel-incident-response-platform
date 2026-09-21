import { describe, expect, it } from 'vitest';
import { ASSIST_RULES, assist } from '../assistEngine.js';
import { computeRisk } from '../riskEngine.js';
import { buildChain } from '../attackChain.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => new Date(T0 + ms).toISOString();

const criticalRisk = () =>
  computeRisk({
    signals: [
      { id: 'REPEATED_AUTH_FAILURE', count: 27 },
      'UNKNOWN_EXTERNAL_IP',
      'PRIVILEGED_ACCOUNT',
      'PRIVILEGE_ESCALATION',
      'SENSITIVE_RESOURCE_ACCESS',
    ],
  });

const cheapAction = {
  id: 'LOCK_ACCOUNT',
  label: 'Lock the affected account',
  reduction: 23,
  reversible: true,
  serviceImpact: 'low',
};

describe('assist', () => {
  it('leads with an action when containment is cheap and risk is critical', () => {
    const result = assist({ risk: criticalRisk(), recommendation: cheapAction });
    expect(result.notes[0].priority).toBe('act');
    expect(result.notes[0].text).toMatch(/little reason to wait/i);
  });

  it('points out a cheaper alternative to a disruptive action', () => {
    // The interaction an analyst has to notice across two panels, noticed
    // for them.
    const result = assist({
      risk: criticalRisk(),
      recommendation: {
        id: 'ISOLATE_SERVICE',
        label: 'Isolate the affected service',
        reduction: 27,
        reversible: true,
        serviceImpact: 'high',
      },
      alternatives: [cheapAction],
    });
    const note = result.notes.find((n) => n.id === 'CONTAINMENT_COSTS_MORE_THAN_IT_SAVES');
    expect(note.text).toMatch(/without doing that/i);
  });

  it('flags a hole in the chain rather than reading past it', () => {
    const chain = buildChain([
      { id: '1', type: 'UNKNOWN_IP', at: at(0) },
      { id: '2', type: 'SENSITIVE_API_ACCESS', at: at(10_000) },
    ]);
    const note = assist({ chain }).notes.find((n) => n.id === 'CHAIN_HAS_A_GAP');
    expect(note.text).toMatch(/happened and were not seen/i);
  });

  it('says containment now costs less when the chain is nearly through', () => {
    const chain = buildChain([
      { id: '1', type: 'UNKNOWN_IP', at: at(0) },
      { id: '2', type: 'FAILED_LOGIN', at: at(1000) },
      { id: '3', type: 'PRIVILEGE_ESCALATION', at: at(2000) },
      { id: '4', type: 'SENSITIVE_API_ACCESS', at: at(3000) },
    ]);
    const note = assist({ chain }).notes.find((n) => n.id === 'CHAIN_NEAR_THE_END');
    expect(note).toBeTruthy();
    expect(note.priority).toBe('act');
  });

  it('names which factor is actually driving the score', () => {
    // Factors are top-level inputs on computeRisk, not nested.
    const risk = computeRisk({ likelihood: 20, impact: 30, exposure: 90 });
    const note = assist({ risk }).notes.find((n) => n.id === 'RISK_DRIVEN_BY_EXPOSURE');
    expect(note.text).toMatch(/reducing reachability/i);
  });

  it('warns when one signal carries most of the score', () => {
    // If that signal is wrong, so is the number — which is exactly the kind
    // of thing that is invisible in a gauge.
    const risk = computeRisk({
      signals: [{ id: 'REPEATED_AUTH_FAILURE', count: 500 }, 'OFF_HOURS_ACTIVITY'],
    });
    const note = assist({ risk }).notes.find((n) => n.id === 'ONE_DOMINANT_CONTRIBUTOR');
    expect(note?.text).toMatch(/so is most of this score/i);
  });

  it('translates a blast radius into what users lose', () => {
    const note = assist({
      blast: {
        origin: { label: 'Auth Service' },
        counts: { workflows: 2 },
        workflows: [{ label: 'Sign in' }, { label: 'Checkout' }],
      },
    }).notes.find((n) => n.id === 'BLAST_RADIUS_REACHES_WORKFLOWS');
    expect(note.text).toMatch(/sign in and checkout stop working/i);
  });

  it('tells the reader to check the reasoning when confidence is low', () => {
    const note = assist({ incident: { confidence: 42 } }).notes.find(
      (n) => n.id === 'LOW_CONFIDENCE_CORRELATION'
    );
    expect(note.text).toMatch(/read the reasoning/i);
  });

  it('treats a quiet estate as a finding', () => {
    const result = assist({ incident: null, risk: computeRisk({ signals: [] }) });
    expect(result.notes[0].text).toMatch(/a finding, not an absence of one/i);
  });

  it('sorts actions above cautions above context', () => {
    const result = assist({
      risk: criticalRisk(),
      recommendation: cheapAction,
      incident: { confidence: 40 },
    });
    const weights = result.notes.map((n) => n.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it('honours a limit and reports how many fired', () => {
    const result = assist(
      { risk: criticalRisk(), recommendation: cheapAction, incident: { confidence: 40 } },
      { limit: 1 }
    );
    expect(result.notes).toHaveLength(1);
    expect(result.counts.fired).toBeGreaterThan(1);
  });

  it('survives a rule that throws instead of taking the panel down', () => {
    // Guidance is the least important thing on the page and must never be
    // the thing that breaks it.
    const result = assist({ risk: { factors: null, contributors: 'not an array' } });
    expect(Array.isArray(result.notes)).toBe(true);
  });

  it('carries its own disclosure in the payload', () => {
    // So it travels with the data wherever it is rendered, rather than
    // living only in one component.
    expect(assist({}).disclosure).toMatch(/not a language model/i);
    expect(assist({}).disclosure).toMatch(/no external ai is called/i);
  });

  it('says nothing when nothing applies', () => {
    expect(assist({ incident: { confidence: 90 } }).notes).toEqual([]);
  });

  it('is deterministic', () => {
    const state = { risk: criticalRisk(), recommendation: cheapAction };
    expect(assist(state)).toEqual(assist(state));
  });

  it('handles being given nothing at all', () => {
    expect(assist().notes).toEqual([]);
    expect(assist().counts.rules).toBe(ASSIST_RULES.length);
  });
});

describe('rule integrity', () => {
  it('gives every rule an id, a priority and both functions', () => {
    ASSIST_RULES.forEach((rule) => {
      expect(typeof rule.id).toBe('string');
      expect(['act', 'caution', 'context']).toContain(rule.priority);
      expect(typeof rule.when).toBe('function');
      expect(typeof rule.say).toBe('function');
    });
  });

  it('gives every rule a unique id', () => {
    const ids = ASSIST_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never throws on an empty state', () => {
    ASSIST_RULES.forEach((rule) => {
      expect(() => rule.when({}), `${rule.id} threw on empty state`).not.toThrow();
    });
  });
});

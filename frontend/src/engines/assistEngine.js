/**
 * SENTINEL Assist — contextual guidance.
 *
 * ## What this is not
 *
 * It is **not a language model**, and it must never be presented as one.
 * There is no external API call, no inference, nothing generative. Every
 * sentence it produces comes from a rule in the table below, written by
 * hand, firing on a condition that can be read and checked.
 *
 * That constraint is not a limitation to apologise for — it is the reason
 * the output can be trusted. A rule that fires on
 * `chain.gaps.length > 0` says something true about the data by
 * construction. A model asked to "explain this incident" says something
 * plausible, which is a different property entirely, and in an operations
 * context the difference is the whole thing.
 *
 * The interface says all of this out loud, because a panel called "Assist"
 * that quietly implied a model behind it would be borrowing credibility it
 * has not earned.
 *
 * ## What it is for
 *
 * An analyst reading five panels has to hold five things in their head and
 * notice which ones interact. That noticing is the work. These rules
 * encode the interactions worth noticing — a critical incident with a
 * reversible cheap containment action available; a chain with a hole in it;
 * a risk score that is high because of exposure rather than impact — and
 * surface them in priority order.
 */

import { CRITICAL_THRESHOLD } from './severity.js';

/** How urgently a note wants attention. Higher sorts first. */
export const NOTE_PRIORITY = Object.freeze({
  act: 3,
  caution: 2,
  context: 1,
});

/**
 * The rules.
 *
 * Each is `{ id, priority, when(state), say(state) }`. Written as data so
 * the whole reasoning surface can be read in one screen and argued with —
 * which is the point of not using a model.
 */
export const ASSIST_RULES = Object.freeze([
  {
    id: 'CRITICAL_WITH_CHEAP_CONTAINMENT',
    priority: 'act',
    when: ({ risk, recommendation }) =>
      risk?.score >= CRITICAL_THRESHOLD &&
      recommendation?.reversible === true &&
      recommendation?.serviceImpact === 'low',
    say: ({ recommendation, risk }) =>
      `Risk is ${risk.score} and ${recommendation.label.toLowerCase()} would ` +
      `remove ${recommendation.reduction} points, reversibly and without ` +
      `service disruption. There is little reason to wait on this one.`,
  },
  {
    id: 'CONTAINMENT_COSTS_MORE_THAN_IT_SAVES',
    priority: 'caution',
    when: ({ recommendation, alternatives }) =>
      recommendation?.serviceImpact === 'high' &&
      (alternatives ?? []).some(
        (a) => a.serviceImpact === 'low' && a.reduction >= recommendation.reduction * 0.7
      ),
    say: ({ recommendation, alternatives }) => {
      const cheaper = alternatives.find(
        (a) => a.serviceImpact === 'low' && a.reduction >= recommendation.reduction * 0.7
      );
      return (
        `${recommendation.label} removes the most risk but takes a service ` +
        `offline. ${cheaper.label} removes ${cheaper.reduction} of the ` +
        `${recommendation.reduction} without doing that.`
      );
    },
  },
  {
    id: 'CHAIN_HAS_A_GAP',
    priority: 'caution',
    when: ({ chain }) => (chain?.gaps?.length ?? 0) > 0,
    say: ({ chain }) =>
      `The chain reached ${chain.furthest.label.toLowerCase()} without ` +
      `${chain.gaps.map((g) => g.label.toLowerCase()).join(' or ')} being ` +
      `observed. Either those steps were unnecessary, or they happened and ` +
      `were not seen — the second is worth ruling out before closing this.`,
  },
  {
    id: 'CHAIN_NEAR_THE_END',
    priority: 'act',
    when: ({ chain }) => (chain?.progress ?? 0) >= 0.66 && (chain?.ahead?.length ?? 0) > 0,
    say: ({ chain }) =>
      `${Math.round(chain.progress * 100)}% through the model, with ` +
      `${chain.ahead[0].label.toLowerCase()} still ahead. Containment now ` +
      `costs less than containment after it.`,
  },
  {
    id: 'RISK_DRIVEN_BY_EXPOSURE',
    priority: 'context',
    when: ({ risk }) => {
      const f = risk?.factors;
      if (!f) return false;
      return f.exposure.value > f.impact.value && f.exposure.value > f.likelihood.value;
    },
    say: ({ risk }) =>
      `Risk here is driven mostly by exposure (${risk.factors.exposure.value}), ` +
      `not by impact. Reducing reachability will move the number further than ` +
      `hardening the target.`,
  },
  {
    id: 'RISK_DRIVEN_BY_IMPACT',
    priority: 'context',
    when: ({ risk }) => {
      const f = risk?.factors;
      if (!f) return false;
      return f.impact.value > f.exposure.value && f.impact.value > f.likelihood.value;
    },
    say: ({ risk }) =>
      `Risk here is driven mostly by impact (${risk.factors.impact.value}). ` +
      `What is reachable matters less than what it would cost if reached.`,
  },
  {
    id: 'ONE_DOMINANT_CONTRIBUTOR',
    priority: 'context',
    when: ({ risk }) => {
      const c = risk?.contributors ?? [];
      return c.length >= 2 && c[0].points >= c[1].points * 2;
    },
    say: ({ risk }) =>
      `${risk.contributors[0].label} alone accounts for ` +
      `${risk.contributors[0].points} of the ${risk.score}. If that signal is ` +
      `wrong, so is most of this score.`,
  },
  {
    id: 'BLAST_RADIUS_REACHES_WORKFLOWS',
    priority: 'caution',
    when: ({ blast }) => (blast?.counts?.workflows ?? 0) > 0,
    say: ({ blast }) =>
      `If ${blast.origin.label} goes down, ` +
      `${blast.workflows.map((w) => w.label.toLowerCase()).join(' and ')} stop ` +
      `working for users. That is the cost of the isolation options above.`,
  },
  {
    id: 'LOW_CONFIDENCE_CORRELATION',
    priority: 'caution',
    when: ({ incident }) => incident && incident.confidence < 55,
    say: ({ incident }) =>
      `Correlation confidence is ${incident.confidence} — only part of the ` +
      `rule set agreed. Read the reasoning before acting on the ` +
      `classification.`,
  },
  {
    id: 'QUIET',
    priority: 'context',
    // Requires a risk result to exist: "nothing is happening" is only a
    // finding once something has actually looked. Firing on an empty state
    // would turn "no data yet" into "all clear", which is the one thing an
    // operations console must never say by accident.
    when: ({ incident, risk }) => Boolean(risk) && !incident && risk.score === 0,
    say: () =>
      'Nothing is correlated and no signal is contributing to risk. That is ' +
      'a finding, not an absence of one: the feed is connected and reporting ' +
      'a quiet estate.',
  },
]);

/**
 * Run the rules against the current state.
 *
 * A rule that throws is skipped and counted rather than taking the panel
 * down with it — guidance is the least important thing on the page and
 * must never be the thing that breaks it.
 */
export function assist(state = {}, options = {}) {
  const limit = options.limit ?? 4;
  let failed = 0;

  const notes = ASSIST_RULES.map((rule) => {
    try {
      if (!rule.when(state)) return null;
      return {
        id: rule.id,
        priority: rule.priority,
        weight: NOTE_PRIORITY[rule.priority] ?? 0,
        text: rule.say(state),
      };
    } catch {
      failed += 1;
      return null;
    }
  })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);

  return {
    notes: notes.slice(0, limit),
    counts: {
      rules: ASSIST_RULES.length,
      fired: notes.length,
      shown: Math.min(limit, notes.length),
      failed,
    },
    /**
     * Carried in the payload, not only written in the component, so the
     * disclosure travels with the data wherever it is rendered.
     */
    disclosure:
      'Generated by deterministic rules, not a language model. No external ' +
      'AI is called and none is implied.',
  };
}

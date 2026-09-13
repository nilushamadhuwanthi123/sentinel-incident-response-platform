/**
 * Response console — recommendations and the what-if simulator.
 *
 * The screen that answers the question a risk score does not: **what should
 * I do first, and what does it cost me?**
 *
 * Every recommendation shows its price alongside its value — how much risk
 * it removes, whether it can be undone, what it takes offline. A tool that
 * ranks actions without naming their cost is ranking blind, and an analyst
 * who learns that will stop reading the list.
 *
 * Selecting actions builds a projection. The projection is computed by the
 * same engine as the live score, it is labelled `projected` throughout, and
 * nothing here executes anything: this is a planning surface, and a
 * portfolio project must not imply it can lock real accounts.
 */

import { useMemo, useState } from 'react';
import {
  recommendResponses,
  simulateResponses,
} from '../../engines/recommendationEngine.js';
import { SeverityBadge } from '../shared/SeverityBadge.jsx';

const IMPACT_LABEL = {
  low: 'little disruption',
  medium: 'some disruption',
  high: 'takes the service offline',
};

export function ResponseConsole({ incident }) {
  const [selected, setSelected] = useState([]);

  const context = useMemo(
    () => ({ signals: incident?.riskSignals ?? [] }),
    [incident]
  );

  const { recommendations, rationale, excluded, considered } = useMemo(
    () => recommendResponses(context),
    [context]
  );

  const projection = useMemo(
    () => (selected.length > 0 ? simulateResponses(context, selected) : null),
    [context, selected]
  );

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  if (!incident || recommendations.length === 0) {
    return (
      <p className="resp-empty">
        No containment action applies to what has been observed. That is a
        finding: an action list that always has six entries teaches an analyst
        to stop reading it.
      </p>
    );
  }

  return (
    <div className="resp">
      <div className="resp-list">
        <p className="resp-rationale">{rationale}</p>

        <ul className="resp-options">
          {recommendations.map((r) => {
            const on = selected.includes(r.id);
            return (
              <li key={r.id} className={`resp-option ${on ? 'is-on' : ''}`}>
                <button
                  type="button"
                  className="resp-toggle"
                  aria-pressed={on}
                  onClick={() => toggle(r.id)}
                >
                  <span className="resp-label">{r.label}</span>
                  <span className="resp-reduction">&minus;{r.reduction}</span>
                </button>

                <p className="resp-meta">
                  <span className={`resp-tag resp-tag--${r.serviceImpact}`}>
                    {IMPACT_LABEL[r.serviceImpact]}
                  </span>
                  <span
                    className={`resp-tag resp-tag--${
                      r.reversible ? 'reversible' : 'permanent'
                    }`}
                  >
                    {r.reversible ? 'reversible' : 'cannot be undone'}
                  </span>
                  <span className="resp-tag">{r.confidence} confidence</span>
                </p>

                <p className="resp-addresses">
                  Addresses:{' '}
                  {r.addresses
                    .map((s) => s.replace(/_/g, ' ').toLowerCase())
                    .join(', ')}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="resp-considered">
          {considered} actions considered, {excluded} excluded as inapplicable
          to what was observed.
        </p>
      </div>

      <div className="resp-sim">
        <h3 className="resp-sim-title">
          What-if
          <span className="resp-sim-tag">projected</span>
        </h3>

        {projection ? (
          <>
            <p className="resp-sim-headline">
              <span className="resp-sim-from">{projection.before.score}</span>
              <span aria-hidden="true"> → </span>
              <span className="resp-sim-to">{projection.after.score}</span>
              <SeverityBadge
                severity={projection.after.severity}
                label={projection.after.severity.toUpperCase()}
              />
            </p>

            {/* A running total, not a sum. Two actions that both lower
                likelihood do not add up, and presenting them as if they did
                overstates the combination — the exact mistake that gets
                someone to stop responding too early. */}
            <ol className="resp-steps">
              {projection.steps.map((step) => (
                <li key={step.id} className="resp-step">
                  <span className="resp-step-label">{step.label}</span>
                  <span className="resp-step-math">
                    {step.from} → {step.to}
                  </span>
                </li>
              ))}
            </ol>

            {projection.irreversible.length > 0 && (
              <p className="resp-warn resp-warn--permanent">
                {projection.irreversible.length} of these cannot be undone.
              </p>
            )}
            {projection.disruptive.length > 0 && (
              <p className="resp-warn resp-warn--disruptive">
                {projection.disruptive.length} would take a service offline.
              </p>
            )}
            {projection.stillCritical && (
              <p className="resp-warn resp-warn--critical">
                Risk stays critical. This combination is a first step, not a
                resolution.
              </p>
            )}

            <p className="resp-sim-note">
              Nothing here is executed. This is a planning surface — the
              platform does not lock accounts, block addresses or isolate
              services.
            </p>

            <button
              type="button"
              className="resp-clear"
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </>
        ) : (
          <p className="resp-sim-empty">
            Select one or more actions to project their combined effect. The
            projection runs the same calculation as the live score — a what-if
            that computes differently from the real thing is a what-if that
            lies.
          </p>
        )}
      </div>
    </div>
  );
}

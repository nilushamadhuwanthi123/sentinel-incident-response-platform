/**
 * SENTINEL Assist panel.
 *
 * The disclosure is the first thing in the panel, not a footnote. A box
 * labelled "Assist" sitting in a security console reads as a model unless
 * it says otherwise, and letting a reader assume that would be borrowing
 * credibility this project has not earned.
 *
 * Every note is tagged with the rule that produced it. That is unusual in
 * a guidance panel and deliberate: a reader who disagrees with a sentence
 * can go and find the condition that fired, which is exactly what a model
 * cannot offer.
 */

import { useMemo } from 'react';
import { assist } from '../../engines/assistEngine.js';
import { buildChain } from '../../engines/attackChain.js';
import { recommendResponses } from '../../engines/recommendationEngine.js';

const PRIORITY_LABEL = {
  act: 'Act',
  caution: 'Caution',
  context: 'Context',
};

export function AssistPanel({ incident, risk, blast }) {
  const result = useMemo(() => {
    const chain = incident ? buildChain(incident.events ?? []) : null;
    const { recommendations } = recommendResponses({
      signals: incident?.riskSignals ?? [],
    });

    return assist({
      incident,
      risk,
      chain,
      blast,
      recommendation: recommendations[0] ?? null,
      alternatives: recommendations.slice(1),
    });
  }, [incident, risk, blast]);

  return (
    <div className="assist">
      <p className="assist-disclosure">{result.disclosure}</p>

      {result.notes.length === 0 ? (
        <p className="assist-empty">
          No rule applies to the current state. Saying nothing is the correct
          output when nothing is worth saying — filler would only teach a
          reader to skip this panel.
        </p>
      ) : (
        <ul className="assist-notes">
          {result.notes.map((note) => (
            <li key={note.id} className={`assist-note assist-note--${note.priority}`}>
              <span className="assist-tag">{PRIORITY_LABEL[note.priority]}</span>
              <p className="assist-text">{note.text}</p>
              {/* The rule id, so a reader who disagrees can find the
                  condition that fired rather than argue with a black box. */}
              <span className="assist-rule">{note.id}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="assist-counts">
        {result.counts.fired} of {result.counts.rules} rules matched
        {result.counts.fired > result.counts.shown &&
          `, ${result.counts.shown} shown`}
        .
      </p>
    </div>
  );
}

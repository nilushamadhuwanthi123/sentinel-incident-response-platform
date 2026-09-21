/**
 * Attack chain timeline.
 *
 * Draws every stage of the model, not only the ones that happened. The
 * empty stages carry most of the meaning: an analyst looking at a live
 * incident is not mainly asking what has occurred, they are asking **how
 * far it has got and what comes next**, because that is what decides
 * whether to contain now or watch a little longer.
 *
 * Three states, and the distinction between the last two is the whole
 * point:
 *
 *   reached      — events were observed in this stage
 *   not observed — a gap *below* the furthest stage: either skipped, or
 *                  the platform never saw it
 *   ahead        — not reached yet
 *
 * A chain that drew gaps and not-yet-reached stages the same way would look
 * more confident than it is, and the hole in the middle is exactly the
 * thing worth noticing.
 */

import { CHAIN_STAGES, nextStage } from '../../engines/attackChain.js';

const duration = (ms) => {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
};

const clock = (ms) =>
  Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 19) : '--:--:--';

export function AttackChain({ chain }) {
  if (!chain) return null;

  const next = nextStage(chain);
  const gapIds = new Set(chain.gaps.map((s) => s.id));

  return (
    <div className="chain">
      <p className="chain-summary">{chain.summary}</p>

      <ol className="chain-track">
        {chain.stages.map((stage) => {
          const state = stage.reached
            ? 'reached'
            : gapIds.has(stage.id)
              ? 'gap'
              : 'ahead';

          return (
            <li key={stage.id} className={`chain-stage chain-stage--${state}`}>
              <span className="chain-marker" aria-hidden="true" />

              <div className="chain-body">
                <h3 className="chain-stage-title">
                  {stage.label}
                  <span className="chain-state">
                    {state === 'reached' && `${stage.count} events`}
                    {state === 'gap' && 'not observed'}
                    {state === 'ahead' && 'not reached'}
                  </span>
                </h3>

                <p className="chain-desc">{stage.description}</p>

                {stage.reached && (
                  <>
                    <p className="chain-meta">
                      {clock(stage.firstAt)}
                      {stage.durationMs > 0 && ` · over ${duration(stage.durationMs)}`}
                      {stage.services.length > 0 && ` · ${stage.services.join(', ')}`}
                    </p>

                    <ul className="chain-events">
                      {stage.events.slice(0, 4).map((e) => (
                        <li key={e.id} className={`chain-event chain-event--${e.severity}`}>
                          <span className="chain-event-time">{clock(e.at)}</span>
                          <span className="chain-event-type">
                            {String(e.type).replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </li>
                      ))}
                      {stage.events.length > 4 && (
                        <li className="chain-event chain-event--more">
                          and {stage.events.length - 4} more
                        </li>
                      )}
                    </ul>
                  </>
                )}

                {state === 'gap' && (
                  <p className="chain-warn">
                    Either this step was not needed, or it happened and was not
                    seen. A chain with an invisible hole in it is worse than an
                    uncertain one, so it is drawn rather than closed over.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {next && (
        <p className="chain-next">
          <strong>Next in this model: {next.label}.</strong> {next.note}
        </p>
      )}

      {chain.unmapped.length > 0 && (
        <p className="chain-unmapped">
          {chain.unmapped.length} event type
          {chain.unmapped.length === 1 ? '' : 's'} could not be placed in the
          model: {[...new Set(chain.unmapped)].join(', ')}. Unmapped is
          reported, never guessed.
        </p>
      )}

      <p className="chain-caveat">
        These {CHAIN_STAGES.length} stages are a simplified model, not a MITRE
        ATT&amp;CK mapping. The vocabulary is borrowed because it is the one
        analysts use; the technique taxonomy is not implemented and is not
        claimed.
      </p>
    </div>
  );
}

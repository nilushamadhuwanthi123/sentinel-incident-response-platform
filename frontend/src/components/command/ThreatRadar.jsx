/**
 * Threat radar.
 *
 * The radar is the piece most likely to be decoration, so the rule here is
 * strict: **no pixel is placed by anything other than the data**. Bearing
 * comes from the signal's category, distance from its severity, size from
 * its confidence, brightness from its recency. Nothing is random, nothing
 * is placed for balance, and the engine that decides all of it has 33 tests
 * of its own.
 *
 * The sweep is the only ornament, and it is honest: it rotates at a fixed
 * rate and carries no meaning, so a viewer is never invited to read
 * anything into where it happens to be. Under reduced motion it does not
 * move at all, and nothing is lost — the blips are already positioned.
 *
 * Every signal is also a row in a real list underneath. The picture and the
 * list are generated from the same frame, so the screen-reader experience
 * cannot fall behind the visual one, which is the failure mode of every
 * radar that bolts a text summary on afterwards.
 */

import { useMemo, useState } from 'react';
import { buildRadarFrame, SIGNAL_CATEGORIES } from '../../engines/radarEngine.js';
import { SeverityBadge } from '../shared/SeverityBadge.jsx';

const SIZE = 320;
const CENTRE = SIZE / 2;
const RIM = CENTRE - 14;
/** Rings at quarter steps: they are the severity scale, drawn. */
const RINGS = [0.25, 0.5, 0.75, 1];

/** Polar → cartesian. Bearing 0 is north, clockwise, like a real scope. */
function place(bearing, distance) {
  const radians = ((bearing - 90) * Math.PI) / 180;
  const radius = RIM * distance;
  return {
    x: CENTRE + radius * Math.cos(radians),
    y: CENTRE + radius * Math.sin(radians),
  };
}

export function ThreatRadar({ events = [], now }) {
  const [selectedId, setSelectedId] = useState(null);

  const frame = useMemo(
    () => buildRadarFrame(events, now ? { now } : {}),
    [events, now]
  );

  const selected =
    frame.signals.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="radar">
      <div className="radar-scope">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={frame.summary}
          className="radar-svg"
        >
          {RINGS.map((r) => (
            <circle
              key={r}
              className="radar-ring"
              cx={CENTRE}
              cy={CENTRE}
              r={RIM * r}
            />
          ))}

          {/* Sector dividers, so the four categories are visibly separate
              regions rather than an unexplained scatter. */}
          {Object.values(SIGNAL_CATEGORIES).map((c) => {
            const end = place(c.from, 1);
            return (
              <line
                key={c.id}
                className="radar-spoke"
                x1={CENTRE}
                y1={CENTRE}
                x2={end.x}
                y2={end.y}
              />
            );
          })}

          {Object.values(SIGNAL_CATEGORIES).map((c) => {
            const mid = place((c.from + c.to) / 2, 1.06);
            return (
              <text
                key={c.id}
                className="radar-sector-label"
                x={mid.x}
                y={mid.y}
                textAnchor="middle"
              >
                {c.label}
              </text>
            );
          })}

          <g className="radar-sweep" aria-hidden="true">
            <line x1={CENTRE} y1={CENTRE} x2={CENTRE} y2={CENTRE - RIM} />
          </g>

          {frame.signals.map((signal) => {
            const { x, y } = place(signal.bearing, signal.distance);
            const isSelected = signal.id === selectedId;
            return (
              <g key={signal.id}>
                {signal.persistent && (
                  // A critical signal keeps a halo until it is acknowledged.
                  // An alert that quietly fades on a timer is an alert
                  // nobody saw.
                  <circle
                    className="radar-halo"
                    cx={x}
                    cy={y}
                    r={8 + signal.radius * 10}
                  />
                )}
                <circle
                  className={`radar-blip radar-blip--${signal.severity} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  cx={x}
                  cy={y}
                  r={3 + signal.radius * 6}
                  opacity={0.35 + signal.intensity * 0.65}
                  onClick={() => setSelectedId(isSelected ? null : signal.id)}
                />
              </g>
            );
          })}
        </svg>

        {/* Not a live region. The connection badge is the page's polite
            announcer; a second one competing with it means a screen reader
            user hears two things at once and attends to neither. The summary
            is also the scope's accessible name, so it is never missed. */}
        <p className="radar-summary">{frame.summary}</p>
      </div>

      <div className="radar-side">
        <ul className="radar-legend">
          {frame.byCategory.map((c) => (
            <li key={c.id} className="radar-legend-item">
              <span className="radar-legend-name">{c.label}</span>
              <span className="radar-legend-count">{c.count}</span>
            </li>
          ))}
        </ul>

        {/* The list is the radar, in a form that can be read aloud, tabbed
            through and copied. It is not a fallback — it is the same data. */}
        <table className="radar-table">
          <caption className="visually-hidden">
            Active signals. Selecting a row highlights it on the scope.
          </caption>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Sector</th>
              <th scope="col">Service</th>
              <th scope="col">Severity</th>
            </tr>
          </thead>
          <tbody>
            {frame.signals
              .slice()
              .reverse()
              .map((signal) => (
                <tr
                  key={signal.id}
                  className={signal.id === selectedId ? 'is-selected' : ''}
                >
                  <td>
                    <button
                      type="button"
                      className="radar-row-button"
                      aria-pressed={signal.id === selectedId}
                      onClick={() =>
                        setSelectedId(signal.id === selectedId ? null : signal.id)
                      }
                    >
                      {String(signal.type).replace(/_/g, ' ').toLowerCase()}
                    </button>
                  </td>
                  <td>{signal.categoryLabel}</td>
                  <td>{signal.service ?? '—'}</td>
                  <td>
                    <SeverityBadge
                      severity={signal.severity}
                      score={signal.severityScore}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {frame.signals.length === 0 && (
          <p className="radar-empty">
            Nothing on the scope. That is a finding, not an absence of one —
            the feed is connected and reporting no active signals.
          </p>
        )}

        {selected && (
          <dl className="radar-detail">
            <div>
              <dt>Type</dt>
              <dd>{selected.detail.type}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{selected.detail.source ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>{selected.detail.user ?? 'none recorded'}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{selected.confidence}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{Math.round(selected.ageMs / 1000)}s</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

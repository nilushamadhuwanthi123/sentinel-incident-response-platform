/**
 * Investigation workspace.
 *
 * The Command Center answers *what is happening*. This answers *what
 * actually happened* — the place an analyst goes when the summary is no
 * longer enough and they need the evidence itself.
 *
 * It is built around one principle: **every claim on this page can be
 * traced to the events that produced it.** The chain shows which events put
 * the incident in each stage. The correlation reasoning lists the rule and
 * the evidence it matched on. The evidence table is the raw feed, filtered
 * to this incident and nothing else. Nothing here asks to be believed.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildChain } from '../engines/attackChain.js';
import { computeRisk } from '../engines/riskEngine.js';
import { severityOf } from '../engines/severity.js';
import { Panel } from '../components/shared/Panel.jsx';
import { SeverityBadge } from '../components/shared/SeverityBadge.jsx';
import { AttackChain } from '../components/command/AttackChain.jsx';
import { ResponseConsole } from '../components/command/ResponseConsole.jsx';
import { ForensicsDesk } from '../components/command/ForensicsDesk.jsx';

const clock = (value) => {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 19) : '--:--:--';
};

export function Investigation({ incident, risk }) {
  const [filter, setFilter] = useState('all');

  // Memoised rather than defaulted inline: `incident?.events ?? []` builds
  // a new array on every render, which would make the chain rebuild — and
  // the evidence table re-sort — on every tick of the live feed.
  const events = useMemo(() => incident?.events ?? [], [incident]);
  const chain = useMemo(() => buildChain(events), [events]);

  const incidentRisk = useMemo(
    () => risk ?? computeRisk({ signals: incident?.riskSignals ?? [] }),
    [risk, incident]
  );

  const types = useMemo(
    () => [...new Set(events.map((e) => e.type))].sort(),
    [events]
  );

  const visible = filter === 'all' ? events : events.filter((e) => e.type === filter);

  if (!incident) {
    return (
      <main id="main" className="inv">
        <h1 className="inv-title">Investigation</h1>
        <p className="inv-empty">
          No incident is currently correlated, so there is nothing to
          investigate. That is the normal state of an operations console and
          a finding in itself — it is not an error.
        </p>
        <Link className="inv-back" to="/">
          Back to the Command Center
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="inv">
      <Link className="inv-back" to="/">
        ← Command Center
      </Link>

      <header className="inv-head">
        <h1 className="inv-title">{incident.label}</h1>
        <div className="inv-badges">
          <SeverityBadge
            severity={severityOf(incident.confidence)}
            score={incident.confidence}
            label="CONFIDENCE"
          />
          <SeverityBadge
            severity={incidentRisk.severity}
            score={incidentRisk.score}
            label="RISK"
          />
        </div>
        <p className="inv-line">
          {incident.eventIds.length} events over{' '}
          {Math.round(incident.window.spanMs / 1000)}s ·{' '}
          {clock(incident.window.from)} to {clock(incident.window.to)}
        </p>
      </header>

      <div className="inv-grid">
        <Panel title="Attack chain" hint={`${Math.round(chain.progress * 100)}% through the model`}>
          <AttackChain chain={chain} />
        </Panel>

        <Panel title="Entities" hint="what these events have in common">
          <dl className="inv-entities">
            <div>
              <dt>Source addresses</dt>
              <dd>{incident.entities.sourceIps.join(', ') || 'none recorded'}</dd>
            </div>
            <div>
              <dt>Identities</dt>
              <dd>{incident.entities.users.join(', ') || 'none recorded'}</dd>
            </div>
            <div>
              <dt>Sessions</dt>
              <dd>{incident.entities.sessions.join(', ') || 'none recorded'}</dd>
            </div>
            <div>
              <dt>Services touched</dt>
              <dd>{incident.entities.services.join(', ') || 'none recorded'}</dd>
            </div>
          </dl>

          <h3 className="inv-sub">Why these events were grouped</h3>
          <ol className="inv-reasons">
            {incident.reasoning.map((r) => (
              <li key={r.rule}>
                <span className="inv-reason-detail">{r.detail}</span>
                <span className="inv-reason-rule">{r.rule}</span>
                <span className="inv-reason-weight">+{r.weight}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Response" hint="nothing is executed">
          <ResponseConsole incident={incident} />
        </Panel>

        <Panel title="Forensics" hint="checksummed record, not a signature">
          <ForensicsDesk incident={incident} />
        </Panel>

        <Panel
          title="Evidence"
          hint={`${visible.length} of ${events.length} events`}
          className="inv-evidence"
        >
          {/* The raw feed, filtered to this incident and nothing else. Every
              claim above is traceable to a row here. */}
          <div className="inv-filters">
            <button
              type="button"
              className={`inv-filter ${filter === 'all' ? 'is-on' : ''}`}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className={`inv-filter ${filter === type ? 'is-on' : ''}`}
                aria-pressed={filter === type}
                onClick={() => setFilter(type)}
              >
                {type.replace(/_/g, ' ').toLowerCase()}
              </button>
            ))}
          </div>

          <table className="inv-table">
            <caption className="visually-hidden">
              Events belonging to this incident, oldest first.
            </caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">Service</th>
                <th scope="col">Source</th>
                <th scope="col">Identity</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td className="inv-mono">{clock(e.atMs ?? e.at)}</td>
                  <td className="inv-type">
                    {String(e.type).replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td>{e.service ?? '—'}</td>
                  <td className="inv-mono">{e.sourceIp ?? '—'}</td>
                  <td>{e.userId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </main>
  );
}

export default Investigation;

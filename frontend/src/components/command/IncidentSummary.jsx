/**
 * Incident summary.
 *
 * This is the moment the product exists for: the point where a scrolling
 * list of individually-meaningless events becomes one sentence an analyst
 * can act on.
 *
 * So it shows its working. Every rule that fired is listed with the
 * evidence it fired on — the reader is never asked to trust the
 * classification, they are shown why it was made and can disagree with it.
 */

import { SeverityBadge } from '../shared/SeverityBadge.jsx';
import { severityOf } from '../../engines/severity.js';

export function IncidentSummary({ incident }) {
  if (!incident) {
    return (
      <div className="incident incident--none">
        <p className="incident-none-title">Nothing correlated</p>
        <p className="incident-none-body">
          Events are arriving, but none of them are related strongly enough
          to be called an incident. That is the normal state of an operations
          console, and it is a finding rather than an absence of one.
        </p>
      </div>
    );
  }

  const severity = severityOf(incident.confidence);

  return (
    <div className="incident">
      <div className="incident-head">
        <h3 className="incident-title">{incident.label}</h3>
        <SeverityBadge severity={severity} score={incident.confidence} label="CONFIDENCE" />
      </div>

      <p className="incident-line">
        {incident.eventIds.length} related events over{' '}
        {Math.round(incident.window.spanMs / 1000)}s
        {incident.entities.users.length > 0 && (
          <> · identity <b>{incident.entities.users[0]}</b></>
        )}
        {incident.entities.sourceIps.length > 0 && (
          <> · from <b>{incident.entities.sourceIps[0]}</b></>
        )}
      </p>

      <h4 className="incident-sub">Why these events were grouped</h4>
      <ol className="incident-reasons">
        {incident.reasoning.map((reason) => (
          <li key={reason.rule} className="incident-reason">
            <span className="incident-reason-detail">{reason.detail}</span>
            <span className="incident-reason-weight">+{reason.weight}</span>
          </li>
        ))}
      </ol>

      <p className="incident-caveat">
        Confidence is the share of the rule set that agreed, not a
        statistical probability.
      </p>
    </div>
  );
}

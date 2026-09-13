/**
 * Live event feed.
 *
 * Three decisions here are worth more than the markup.
 *
 * **Newest first, and only the last 40 rendered.** The store already caps
 * memory at 400; this caps *DOM*. A feed that renders every event it has
 * ever seen is a feed that stutters after ten minutes, which is exactly
 * when an operator is most likely to be reading it.
 *
 * **Ambient noise is visibly dimmer.** The skill this interface is meant to
 * support is finding signal in noise, so the noise has to be present and
 * has to be distinguishable — hiding it would flatter the correlation
 * engine, and removing it would make the feed a slideshow.
 *
 * **It is a log, not an alert.** `aria-live` is deliberately absent: a feed
 * emitting several events a second through a screen reader is unusable.
 * Announcement belongs to the connection badge and the incident summary,
 * which speak rarely and say something worth hearing.
 */

import { SeverityBadge } from '../shared/SeverityBadge.jsx';
import { severityOf } from '../../engines/severity.js';
import { EVENT_MAPPING } from '../../engines/radarEngine.js';

const VISIBLE = 40;

const timeOf = (value) => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '--:--:--';
  return new Date(ms).toISOString().slice(11, 19);
};

export function EventFeed({ events = [], counts }) {
  const rows = events.slice(-VISIBLE).reverse();

  return (
    <div className="feed">
      <table className="feed-table">
        <caption className="visually-hidden">
          Live security events, newest first. Showing the most recent{' '}
          {rows.length} of {counts?.received ?? rows.length} received.
        </caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Event</th>
            <th scope="col">Service</th>
            <th scope="col">Source</th>
            <th scope="col">Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => {
            const weight = EVENT_MAPPING[event.type]?.weight ?? 40;
            const severity = severityOf(weight);
            return (
              <tr
                key={event.id}
                className={`feed-row ${event.ambient ? 'feed-row--ambient' : ''}`}
              >
                <td className="feed-time">{timeOf(event.at)}</td>
                <td className="feed-type">
                  {String(event.type).replace(/_/g, ' ').toLowerCase()}
                  {event.sequence > 1 && (
                    <span className="feed-repeat">
                      {event.sequence}/{event.of}
                    </span>
                  )}
                </td>
                <td className="feed-service">{event.service ?? '—'}</td>
                <td className="feed-source">{event.sourceIp ?? '—'}</td>
                <td>
                  <SeverityBadge severity={severity} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <p className="feed-empty">
          No events yet. The simulation starts as soon as the feed connects.
        </p>
      )}
    </div>
  );
}

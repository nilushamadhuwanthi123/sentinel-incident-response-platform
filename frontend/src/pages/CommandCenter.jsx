/**
 * Command Center — the first screen anyone sees.
 *
 * It answers, in this order and without being asked:
 *
 *   1. Is what I am looking at current?          (connection badge, first)
 *   2. How bad is it right now, and why?         (risk gauge with contributors)
 *   3. What is the one thing happening?          (correlated incident)
 *   4. What is the estate doing?                 (service strip)
 *   5. What should I do, and what does it cost? (response console)
 *   6. What would it cost if this spread?       (topology + blast radius)
 *   7. Where is it coming from?                  (threat radar)
 *   8. What is actually arriving?                (the feed)
 *
 * The order is the point. Most security dashboards open with the feed,
 * which is the least decision-useful thing on the page: it tells an
 * operator what happened without telling them what it means. Freshness
 * comes first because every number below it is worthless if the feed is
 * stale, and an interface that hides that is worse than one with no
 * numbers at all.
 */

import { useEffect, useRef, useState } from 'react';
import { Panel } from '../components/shared/Panel.jsx';
import { RiskGauge } from '../components/command/RiskGauge.jsx';
import { EventFeed } from '../components/command/EventFeed.jsx';
import { IncidentSummary } from '../components/command/IncidentSummary.jsx';
import { ServiceStrip } from '../components/command/ServiceStrip.jsx';
import { ThreatRadar } from '../components/command/ThreatRadar.jsx';
import { InfrastructureMap } from '../components/command/InfrastructureMap.jsx';
import { ResponseConsole } from '../components/command/ResponseConsole.jsx';
import { AssistPanel } from '../components/command/AssistPanel.jsx';
import { useLive } from '../context/LiveContext.jsx';

export function CommandCenter() {
  const { live, standalone, degraded } = useLive();
  const incident = live.incidents[0] ?? null;
  const score = live.risk?.score ?? 0;

  // Delta is kept here rather than in the store because it is a property of
  // *this view's* last render, not of the incident. Two views open on the
  // same incident should not fight over whose "previous" is authoritative.
  const previous = useRef(score);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    setDelta(score - previous.current);
    previous.current = score;
  }, [score]);

  return (
    <main id="main" className="cc" data-degraded={degraded ? 'true' : 'false'}>
        <h1 className="visually-hidden">SENTINEL Command Center</h1>

        {/* Said once, plainly, at the top of the page rather than buried in a
            footer. The whole feed is invented and the interface must not
            imply otherwise. */}
        <p className="cc-disclosure">
          <strong>Simulation.</strong> Every event, service and score on this
          page comes from a scripted scenario. Nothing here is real telemetry,
          and no vulnerability scanning is performed.
          {standalone && (
            <>
              {' '}
              This build has no backend configured, so it is running the
              server&rsquo;s own simulator in your browser — the same module,
              not a second copy of it.
            </>
          )}
        </p>

        <div className="cc-grid">
          <Panel
            title="Current risk"
            hint="likelihood 40% · impact 35% · exposure 25%"
            className="cc-risk"
          >
            <RiskGauge risk={live.risk} delta={delta} />
          </Panel>

          <Panel title="Active incident" hint={incident ? 'correlated' : 'none'}>
            <IncidentSummary incident={incident} />
          </Panel>

          <Panel
            title="Service health"
            hint={`${Object.keys(live.services).length} reported changes`}
          >
            <ServiceStrip services={live.services} />
          </Panel>

          <Panel
            title="Assist"
            hint="deterministic rules · no language model"
            className="cc-assist"
          >
            <AssistPanel incident={incident} risk={live.risk} />
          </Panel>

          <Panel
            title="Response"
            hint="recommended containment · nothing is executed"
            className="cc-resp"
          >
            <ResponseConsole incident={incident} />
          </Panel>

          <Panel
            title="Infrastructure"
            hint="select a service to project its failure"
            className="cc-topo"
          >
            <InfrastructureMap services={live.services} />
          </Panel>

          <Panel
            title="Threat radar"
            hint="bearing = category · distance = severity · size = confidence"
            className="cc-radar"
          >
            <ThreatRadar events={live.events} />
          </Panel>

          <Panel
            title="Event feed"
            hint={`${live.counts.received} received · ${live.counts.duplicates} duplicate`}
            className="cc-feed"
          >
            <EventFeed events={live.events} counts={live.counts} />
          </Panel>
        </div>
    </main>
  );
}

export default CommandCenter;

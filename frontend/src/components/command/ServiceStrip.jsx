/**
 * Service health strip.
 *
 * Reads the topology's own node list rather than keeping a second copy, so
 * a service added to the graph appears here without anyone remembering to
 * add it twice.
 *
 * Status is text plus a shape plus a colour. The strip is also a list in
 * the accessibility tree, not a row of coloured squares, so it can actually
 * be read aloud.
 */

import { DEFAULT_TOPOLOGY } from '../../engines/topology.js';

const STATUS_LABEL = {
  operational: 'Operational',
  degraded: 'Degraded',
  compromised: 'Compromised',
  offline: 'Offline',
};

export function ServiceStrip({ services = {} }) {
  return (
    <ul className="strip">
      {DEFAULT_TOPOLOGY.nodes.map((node) => {
        const state = services[node.id];
        const status = state?.status ?? 'operational';
        return (
          <li key={node.id} className={`strip-item strip-item--${status}`}>
            <span className="strip-dot" aria-hidden="true" />
            <span className="strip-name">{node.label ?? node.name ?? node.id}</span>
            <span className="strip-status">{STATUS_LABEL[status] ?? status}</span>
            {state?.reason && <span className="strip-reason">{state.reason}</span>}
          </li>
        );
      })}
    </ul>
  );
}

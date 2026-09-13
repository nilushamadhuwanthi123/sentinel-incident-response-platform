/**
 * Live state reducer.
 *
 * Every socket event in SENTINEL folds into one state object through this
 * function. Keeping it a pure reducer — no socket, no React, no clock it
 * does not receive — means the hard parts (ordering, duplicates, bounded
 * memory, correlation) can be tested by calling a function with a list of
 * events, rather than by opening a connection and hoping.
 *
 * It is also what makes replay possible: replaying an incident is just
 * folding the same events again from the initial state.
 */

import { correlateEvents } from './correlationEngine.js';
import { computeRisk } from './riskEngine.js';

/**
 * How many events are kept.
 *
 * An operations console left open overnight must not grow without bound.
 * The cap is on the client because the client is where the tab is: the
 * server already limits what it replays.
 */
export const MAX_EVENTS = 400;

export const initialLiveState = Object.freeze({
  events: [],
  services: {},
  incidents: [],
  correlation: { received: 0, usable: 0, discarded: 0, candidates: 0 },
  risk: null,
  alerts: [],
  lastEventAt: null,
  /** Everything here is simulated; the UI is required to say so. */
  simulated: true,
  counts: { received: 0, duplicates: 0, dropped: 0 },
});

const withoutOldest = (list, max) =>
  list.length <= max ? list : list.slice(list.length - max);

/**
 * Recompute the derived picture.
 *
 * Correlation and risk are derived from events rather than stored
 * alongside them, so there is exactly one place either can be wrong. The
 * cost is recomputation on each batch, which is why `applyEvents` exists:
 * a burst of 27 failed logins should derive once, not 27 times.
 */
function derive(state) {
  const { candidates, stats } = correlateEvents(state.events);
  const primary = candidates[0] ?? null;
  const risk = primary
    ? computeRisk({ signals: primary.riskSignals })
    : computeRisk({ signals: [] });

  return { ...state, incidents: candidates, correlation: stats, risk };
}

function addEvent(state, event) {
  if (!event || typeof event !== 'object' || !event.id) {
    return { ...state, counts: { ...state.counts, dropped: state.counts.dropped + 1 } };
  }

  // Reconnection replays the server's buffer, so the same event genuinely
  // does arrive twice. Dropping it silently would be fine; counting it is
  // better, because a duplicate rate that climbs is a real symptom.
  if (state.events.some((e) => e.id === event.id)) {
    return { ...state, counts: { ...state.counts, duplicates: state.counts.duplicates + 1 } };
  }

  const events = withoutOldest([...state.events, event], MAX_EVENTS);

  return {
    ...state,
    events,
    lastEventAt: event.at ?? state.lastEventAt,
    counts: { ...state.counts, received: state.counts.received + 1 },
  };
}

export function liveReducer(state = initialLiveState, action) {
  switch (action?.type) {
    case 'event:new':
      return derive(addEvent(state, action.payload));

    case 'events:batch': {
      // Fold the whole batch, then derive once.
      const next = (action.payload ?? []).reduce(addEvent, state);
      return derive(next);
    }

    case 'service:statusChanged': {
      const { service, status, reason, at } = action.payload ?? {};
      if (!service) return state;
      return {
        ...state,
        services: { ...state.services, [service]: { status, reason, at } },
      };
    }

    case 'system:alert': {
      const alerts = withoutOldest([...state.alerts, action.payload], 20);
      return { ...state, alerts };
    }

    case 'reset':
      return { ...initialLiveState };

    default:
      return state;
  }
}

/** Fold a list of events in one pass — used by replay and by tests. */
export function applyEvents(events, state = initialLiveState) {
  return liveReducer(state, { type: 'events:batch', payload: events });
}

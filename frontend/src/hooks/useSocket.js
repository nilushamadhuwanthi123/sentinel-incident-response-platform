/**
 * useSocket — the one place the app touches the network.
 *
 * It joins three pure pieces that are each tested on their own:
 *   transport events → connectionState  (is what I am showing current?)
 *   data events      → liveStore        (what is the picture?)
 *
 * The hook itself is deliberately thin. Anything with a rule in it belongs
 * in an engine, where it can be tested without a socket, a timer or a
 * rendered tree.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CONNECTION,
  connectionReducer,
  describeConnection,
  initialConnection,
  isDegraded,
  isFresh,
} from '../engines/connectionState.js';
import { initialLiveState, liveReducer } from '../engines/liveStore.js';
import { createSocketClient } from '../services/socketService.js';
import { createLocalClient, hasBackend } from '../services/localSimulation.js';

/** How often the staleness check runs. */
const HEARTBEAT_MS = 5000;

const DATA_CHANNELS = new Set([
  'event:new',
  'service:statusChanged',
  'system:alert',
]);

export function useSocket(options = {}) {
  const [live, dispatchLive] = useReducer(liveReducer, initialLiveState);
  const [connection, dispatchConnection] = useReducer(
    connectionReducer,
    undefined,
    () => initialConnection()
  );
  const [ready, setReady] = useState(false);
  const clientRef = useRef(null);

  const enabled = options.enabled !== false;

  // With no backend configured the page runs the server's own simulator in
  // the browser rather than showing OFFLINE forever. Both clients satisfy
  // the same three-method interface, so nothing below this line — reducer,
  // engines, components — can tell which one it got, or needs to.
  const standalone = options.createClient ? false : !hasBackend();
  const create =
    options.createClient ?? (standalone ? createLocalClient : createSocketClient);

  useEffect(() => {
    if (!enabled) return undefined;

    const client = create({ url: options.url, factory: options.factory });
    clientRef.current = client;

    const unsubscribe = client.subscribe((action) => {
      switch (action.type) {
        case 'transport:connected':
          dispatchConnection({ type: 'connected', at: action.at });
          return;
        case 'transport:disconnected':
          setReady(false);
          dispatchConnection({ type: 'disconnected', at: action.at, error: action.reason });
          return;
        case 'transport:error':
          dispatchConnection({ type: 'error', at: action.at, error: action.error });
          return;
        case 'system:ready':
          // The server agreeing is a separate fact from the socket being
          // open, and the UI distinguishes them.
          setReady(true);
          dispatchConnection({ type: 'message', at: action.at });
          return;
        default:
          break;
      }

      dispatchConnection({ type: 'message', at: action.at });
      if (DATA_CHANNELS.has(action.type)) {
        dispatchLive({ type: action.type, payload: action.payload });
      }
    });

    client.connect();

    return () => {
      unsubscribe();
      client.close();
      clientRef.current = null;
    };
  }, [enabled, create, options.url, options.factory]);

  // Staleness is a clock fact, not a socket fact: nothing arrives to tell
  // you that nothing is arriving, so it has to be checked on a timer.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(
      () => dispatchConnection({ type: 'tick', at: Date.now() }),
      options.heartbeatMs ?? HEARTBEAT_MS
    );
    return () => clearInterval(id);
  }, [enabled, options.heartbeatMs]);

  const reset = useCallback(() => {
    dispatchLive({ type: 'reset' });
    dispatchConnection({ type: 'reset', at: Date.now() });
  }, []);

  const status = useMemo(() => describeConnection(connection), [connection]);

  return {
    live,
    connection,
    status,
    ready,
    standalone,
    fresh: isFresh(connection),
    degraded: isDegraded(connection),
    reset,
    CONNECTION,
  };
}

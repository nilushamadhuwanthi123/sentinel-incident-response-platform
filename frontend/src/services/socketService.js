/**
 * Socket client.
 *
 * Wrapped rather than used directly for one reason: every component that
 * imports socket.io-client is a component that cannot be rendered in a test
 * without a server. Behind this module, the rest of the app depends on a
 * tiny interface — subscribe, close, status — which a fake satisfies in
 * three lines.
 *
 * Connection *policy* lives in engines/connectionState.js. This file only
 * reports transport facts; it does not decide what they mean.
 */

import { io } from 'socket.io-client';

/**
 * Channels the client listens on. Declared, not discovered: a typo in a
 * channel name is otherwise a silent no-op that looks exactly like a
 * server that never sent anything.
 */
export const CHANNELS = Object.freeze([
  'system:ready',
  'system:alert',
  'event:new',
  'event:correlated',
  'incident:new',
  'incident:updated',
  'service:statusChanged',
  'metric:updated',
  'risk:changed',
  'response:started',
  'response:completed',
]);

export const DEFAULT_URL =
  import.meta.env?.VITE_SOCKET_URL ?? 'http://localhost:4000';

/**
 * Create a client.
 *
 * @param {object}   options
 * @param {string}   [options.url]
 * @param {function} [options.factory]  injectable io(), for tests
 */
export function createSocketClient(options = {}) {
  const url = options.url ?? DEFAULT_URL;
  const factory = options.factory ?? io;

  const socket = factory(url, {
    autoConnect: false,
    // Reconnection is handled here rather than by hand: socket.io already
    // does exponential backoff correctly, and a second implementation
    // racing it is a well-known way to produce duplicate connections.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    transports: ['websocket', 'polling'],
    ...options.socketOptions,
  });

  const listeners = new Set();
  const notify = (action) => listeners.forEach((fn) => fn(action));

  socket.on('connect', () => notify({ type: 'transport:connected', at: Date.now() }));
  socket.on('disconnect', (reason) =>
    notify({ type: 'transport:disconnected', reason, at: Date.now() })
  );
  socket.on('connect_error', (error) =>
    notify({ type: 'transport:error', error: error?.message ?? 'connect error', at: Date.now() })
  );

  CHANNELS.forEach((channel) => {
    socket.on(channel, (payload) =>
      notify({ type: channel, payload, at: Date.now() })
    );
  });

  return {
    connect() {
      socket.connect();
      return this;
    },
    close() {
      listeners.clear();
      socket.removeAllListeners();
      socket.close();
    },
    /** @returns {function} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get connected() {
      return Boolean(socket.connected);
    },
    raw: socket,
  };
}

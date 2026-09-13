/**
 * Standalone simulation client.
 *
 * SENTINEL's frontend deploys as a static site; its server does not. Rather
 * than ship a demo that shows OFFLINE forever, the page runs **the same
 * simulator the server runs** in the browser when no backend is configured.
 *
 * The emphasis is on *the same*. The module is imported from
 * `server/src/simulation/`, not reimplemented here — a second simulator
 * would drift, and the first time it drifted the deployed demo would stop
 * being evidence of anything.
 *
 * It satisfies the same three-method interface as the real socket client,
 * so nothing above it — hook, reducer, engines, components — can tell the
 * difference or needs to.
 */

import { createSimulator } from '../../../server/src/simulation/eventSimulator.js';

export const TICK_MS = 1000;

export function createLocalClient(options = {}) {
  const listeners = new Set();
  const notify = (action) => listeners.forEach((fn) => fn(action));

  const simulator = createSimulator({
    ...options,
    emit: (type, payload) => notify({ type, payload, at: Date.now() }),
  });

  let timer = null;

  return {
    connect() {
      notify({ type: 'transport:connected', at: Date.now() });
      notify({
        type: 'system:ready',
        at: Date.now(),
        payload: { at: new Date().toISOString(), simulated: true, standalone: true },
      });
      simulator.start();
      timer = setInterval(() => simulator.tick(), options.tickMs ?? TICK_MS);
      return this;
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      simulator.stop();
      listeners.clear();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get connected() {
      return simulator.running;
    },
    standalone: true,
  };
}

/**
 * Whether this build has a backend to talk to.
 *
 * Absence of the variable is treated as "no backend", never as localhost:
 * a static deployment that silently tried to reach a developer's machine
 * would show OFFLINE to every visitor with no explanation.
 */
export const hasBackend = () => Boolean(import.meta.env?.VITE_SOCKET_URL);

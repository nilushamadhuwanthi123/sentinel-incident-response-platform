/**
 * One live connection for the whole application.
 *
 * Each view used to open its own socket. With two routes that becomes two
 * connections and — in standalone mode — **two independent simulations**,
 * so moving from the Command Center to an investigation would show a
 * different incident than the one that was clicked. The bug would be
 * invisible against a real backend and obvious in the deployed demo, which
 * is the worst combination.
 *
 * So the connection is opened once, here, and every view reads from it.
 */

import { createContext, useContext } from 'react';
import { useSocket } from '../hooks/useSocket.js';

const LiveContext = createContext(null);

export function LiveProvider({ socketOptions, children }) {
  const value = useSocket(socketOptions ?? {});
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/**
 * Read the live state.
 *
 * Throws rather than returning a plausible empty object if the provider is
 * missing: a view silently rendering zeros because it was mounted outside
 * the provider is a bug that looks exactly like a quiet night.
 */
export function useLive() {
  const value = useContext(LiveContext);
  if (!value) {
    throw new Error('useLive must be used inside a LiveProvider');
  }
  return value;
}

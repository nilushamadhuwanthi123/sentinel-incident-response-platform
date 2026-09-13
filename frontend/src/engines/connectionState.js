/**
 * Connection state machine.
 *
 * An operations interface that silently shows stale numbers is worse than
 * one that admits it lost the connection. So connection state is a first
 * class thing the UI renders, not a boolean hidden in a socket client.
 *
 * The distinction that matters is between CONNECTED and LIVE. A socket can
 * be open while the server has said nothing for two minutes — the transport
 * is fine and the data is old. STALE exists to say exactly that, because
 * "connected" would be true and useless.
 *
 * Pure module: no socket, no timers, no React. It is a reducer over
 * transport events plus the current time, which is what makes every
 * transition testable without opening a connection or waiting for one.
 */

export const CONNECTION = Object.freeze({
  CONNECTING: 'CONNECTING',
  LIVE: 'LIVE',
  STALE: 'STALE',
  RECONNECTING: 'RECONNECTING',
  OFFLINE: 'OFFLINE',
});

/** How long without a message before live data is treated as stale. */
export const STALE_AFTER_MS = 45_000;

/** How many failed attempts before we stop calling it a reconnection. */
export const OFFLINE_AFTER_ATTEMPTS = 5;

/** Exponential backoff, capped — a tab left open overnight must not hammer. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

export const initialConnection = (now = Date.now()) =>
  Object.freeze({
    status: CONNECTION.CONNECTING,
    since: now,
    lastMessageAt: null,
    attempts: 0,
    nextRetryMs: BACKOFF_BASE_MS,
    lastError: null,
  });

/**
 * Retry delay for an attempt number, with deterministic jitter.
 *
 * Jitter is derived from the attempt number rather than Math.random so the
 * schedule is reproducible in a test. Without any jitter, every client that
 * dropped during the same server restart comes back in the same
 * millisecond and knocks it over again.
 */
export function backoffFor(attempt) {
  const n = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
  const raw = BACKOFF_BASE_MS * 2 ** (n - 1);
  const capped = Math.min(BACKOFF_MAX_MS, raw);
  const jitter = 1 + ((n * 37) % 20) / 100; // 1.00–1.19, deterministic
  return Math.round(Math.min(BACKOFF_MAX_MS, capped * jitter));
}

/**
 * Advance the connection state.
 *
 * @param {object} state   previous state
 * @param {object} action  { type, at?, error? }
 */
export function connectionReducer(state, action) {
  const prev = state ?? initialConnection();
  const at = action?.at ?? Date.now();

  switch (action?.type) {
    case 'connected':
      return {
        ...prev,
        status: CONNECTION.LIVE,
        since: at,
        attempts: 0,
        nextRetryMs: BACKOFF_BASE_MS,
        lastError: null,
      };

    case 'message':
      // A message proves the link is alive, so it also recovers from STALE.
      return {
        ...prev,
        status:
          prev.status === CONNECTION.STALE || prev.status === CONNECTION.LIVE
            ? CONNECTION.LIVE
            : prev.status,
        lastMessageAt: at,
      };

    case 'disconnected': {
      const attempts = prev.attempts + 1;
      const offline = attempts >= OFFLINE_AFTER_ATTEMPTS;
      return {
        ...prev,
        status: offline ? CONNECTION.OFFLINE : CONNECTION.RECONNECTING,
        since: at,
        attempts,
        nextRetryMs: backoffFor(attempts),
        lastError: action.error ?? prev.lastError,
      };
    }

    case 'error':
      // An error on an open socket is not a disconnection. Reporting it as
      // one would make the UI flap between LIVE and RECONNECTING every time
      // a single frame failed to parse.
      return { ...prev, lastError: action.error ?? 'unknown error' };

    case 'tick': {
      if (prev.status !== CONNECTION.LIVE) return prev;
      const since = prev.lastMessageAt ?? prev.since;
      const staleAfter = action.staleAfterMs ?? STALE_AFTER_MS;
      if (at - since < staleAfter) return prev;
      return { ...prev, status: CONNECTION.STALE, since: at };
    }

    case 'reset':
      return initialConnection(at);

    default:
      return prev;
  }
}

/** Is the data on screen currently trustworthy? */
export const isFresh = (state) => state?.status === CONNECTION.LIVE;

/** Should the UI warn that what it is showing may be out of date? */
export const isDegraded = (state) =>
  state?.status === CONNECTION.STALE ||
  state?.status === CONNECTION.RECONNECTING ||
  state?.status === CONNECTION.OFFLINE;

/**
 * What to tell the analyst. Every string says what it means for the data,
 * not what it means for the socket — "reconnecting" is jargon, "showing
 * the last known state" is information.
 */
export function describeConnection(state, now = Date.now()) {
  const s = state ?? initialConnection(now);
  const ageMs = s.lastMessageAt ? now - s.lastMessageAt : null;

  switch (s.status) {
    case CONNECTION.LIVE:
      return { tone: 'operational', label: 'LIVE', detail: 'Receiving updates.' };
    case CONNECTION.CONNECTING:
      return { tone: 'gold', label: 'CONNECTING', detail: 'Opening the live feed.' };
    case CONNECTION.STALE:
      return {
        tone: 'gold',
        label: 'STALE',
        detail: ageMs
          ? `No update for ${Math.round(ageMs / 1000)}s. Showing the last known state.`
          : 'Showing the last known state.',
      };
    case CONNECTION.RECONNECTING:
      return {
        tone: 'hazard',
        label: 'RECONNECTING',
        detail: `Attempt ${s.attempts}. Showing the last known state.`,
      };
    case CONNECTION.OFFLINE:
      return {
        tone: 'critical',
        label: 'OFFLINE',
        detail: 'Not connected. Everything on screen is historical.',
      };
    default:
      return { tone: 'muted', label: 'UNKNOWN', detail: '' };
  }
}

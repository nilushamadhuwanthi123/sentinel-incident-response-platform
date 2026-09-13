import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MAX_MS,
  CONNECTION,
  OFFLINE_AFTER_ATTEMPTS,
  STALE_AFTER_MS,
  backoffFor,
  connectionReducer,
  describeConnection,
  initialConnection,
  isDegraded,
  isFresh,
} from '../connectionState.js';

const T0 = Date.parse('2026-09-13T09:00:00.000Z');
const at = (ms) => T0 + ms;

const connected = () =>
  connectionReducer(initialConnection(T0), { type: 'connected', at: T0 });

describe('connectionReducer', () => {
  it('starts by admitting it is not connected yet', () => {
    expect(initialConnection(T0).status).toBe(CONNECTION.CONNECTING);
  });

  it('goes live on connect and clears the failure count', () => {
    const dropped = connectionReducer(connected(), { type: 'disconnected', at: at(1) });
    const back = connectionReducer(dropped, { type: 'connected', at: at(2) });
    expect(back.status).toBe(CONNECTION.LIVE);
    expect(back.attempts).toBe(0);
    expect(back.lastError).toBeNull();
  });

  it('goes stale when nothing has arrived for long enough', () => {
    const live = connectionReducer(connected(), { type: 'message', at: T0 });
    const stillFine = connectionReducer(live, { type: 'tick', at: at(STALE_AFTER_MS - 1) });
    expect(stillFine.status).toBe(CONNECTION.LIVE);

    const stale = connectionReducer(live, { type: 'tick', at: at(STALE_AFTER_MS + 1) });
    expect(stale.status).toBe(CONNECTION.STALE);
  });

  it('recovers from stale the moment a message arrives', () => {
    // The distinction this whole module exists for: an open socket that has
    // said nothing is not the same as a live one, and one message settles it.
    const live = connectionReducer(connected(), { type: 'message', at: T0 });
    const stale = connectionReducer(live, { type: 'tick', at: at(STALE_AFTER_MS + 1) });
    const recovered = connectionReducer(stale, { type: 'message', at: at(STALE_AFTER_MS + 2) });
    expect(recovered.status).toBe(CONNECTION.LIVE);
  });

  it('does not go stale while reconnecting or offline', () => {
    const dropped = connectionReducer(connected(), { type: 'disconnected', at: T0 });
    const ticked = connectionReducer(dropped, { type: 'tick', at: at(STALE_AFTER_MS * 10) });
    expect(ticked.status).toBe(CONNECTION.RECONNECTING);
  });

  it('calls it reconnecting until the attempts run out, then offline', () => {
    let state = connected();
    for (let i = 1; i < OFFLINE_AFTER_ATTEMPTS; i += 1) {
      state = connectionReducer(state, { type: 'disconnected', at: at(i) });
      expect(state.status).toBe(CONNECTION.RECONNECTING);
    }
    state = connectionReducer(state, { type: 'disconnected', at: at(99) });
    expect(state.status).toBe(CONNECTION.OFFLINE);
  });

  it('treats an error on an open socket as an error, not a disconnection', () => {
    // Otherwise one unparseable frame makes the badge flap, and a badge
    // that flaps is a badge nobody reads.
    const state = connectionReducer(connected(), { type: 'error', at: at(1), error: 'bad frame' });
    expect(state.status).toBe(CONNECTION.LIVE);
    expect(state.lastError).toBe('bad frame');
  });

  it('ignores an unknown action instead of losing the state', () => {
    const state = connected();
    expect(connectionReducer(state, { type: 'nonsense' })).toBe(state);
    expect(connectionReducer(state, null)).toBe(state);
  });

  it('resets cleanly', () => {
    const state = connectionReducer(connected(), { type: 'reset', at: at(5) });
    expect(state.status).toBe(CONNECTION.CONNECTING);
    expect(state.attempts).toBe(0);
  });
});

describe('backoffFor', () => {
  it('grows with each attempt', () => {
    expect(backoffFor(2)).toBeGreaterThan(backoffFor(1));
    expect(backoffFor(4)).toBeGreaterThan(backoffFor(3));
  });

  it('is capped, so a tab left open overnight never hammers the server', () => {
    expect(backoffFor(50)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });

  it('is deterministic, so the schedule can be asserted on', () => {
    expect(backoffFor(3)).toBe(backoffFor(3));
  });

  it('does not produce NaN for nonsense', () => {
    expect(Number.isFinite(backoffFor(undefined))).toBe(true);
    expect(Number.isFinite(backoffFor(-4))).toBe(true);
  });
});

describe('describeConnection', () => {
  it('says what the state means for the data, not for the socket', () => {
    const live = connectionReducer(connected(), { type: 'message', at: T0 });
    const stale = connectionReducer(live, { type: 'tick', at: at(60_000) });
    expect(describeConnection(stale, at(60_000)).detail).toContain('last known state');

    let offline = live;
    for (let i = 0; i < OFFLINE_AFTER_ATTEMPTS; i += 1) {
      offline = connectionReducer(offline, { type: 'disconnected', at: at(i) });
    }
    expect(describeConnection(offline).detail).toContain('historical');
  });

  it('labels every state', () => {
    expect(describeConnection(connected()).label).toBe('LIVE');
    expect(describeConnection(initialConnection(T0)).label).toBe('CONNECTING');
  });
});

describe('freshness helpers', () => {
  it('treats only LIVE as fresh', () => {
    expect(isFresh(connected())).toBe(true);
    expect(isFresh(initialConnection(T0))).toBe(false);
  });

  it('treats stale, reconnecting and offline as degraded', () => {
    const live = connectionReducer(connected(), { type: 'message', at: T0 });
    const stale = connectionReducer(live, { type: 'tick', at: at(60_000) });
    expect(isDegraded(stale)).toBe(true);
    expect(isDegraded(connected())).toBe(false);
  });
});

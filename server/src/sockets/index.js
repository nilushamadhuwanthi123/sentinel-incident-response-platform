/**
 * Socket surface.
 *
 * The event contract lives in docs/REALTIME_EVENTS.md and is the thing the
 * frontend codes against; this file is the wiring plus the lifecycle of the
 * simulation that feeds it.
 *
 * One simulator serves every connected client. A per-socket simulator would
 * mean two analysts looking at the same incident seeing different events,
 * which defeats the point of a shared operations picture.
 */

import { createSimulator } from '../simulation/eventSimulator.js';

/** How often the simulation is advanced. */
export const TICK_MS = 1000;

/**
 * A short replay buffer.
 *
 * A client that connects mid-incident with an empty screen has no context,
 * and an operations console that starts blank is useless. The buffer is
 * deliberately small — it is context, not history; history is the incident
 * record, which is a different thing.
 */
export const BUFFER_SIZE = 60;

export function registerSocketHandlers(io, options = {}) {
  const buffer = [];
  let clients = 0;
  let timer = null;

  const record = (channel, payload) => {
    buffer.push({ channel, payload });
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  };

  const simulator = createSimulator({
    ...options,
    emit: (channel, payload) => {
      record(channel, payload);
      io.emit(channel, payload);
    },
  });

  const startClock = () => {
    if (timer) return;
    simulator.start();
    timer = setInterval(() => simulator.tick(), options.tickMs ?? TICK_MS);
    // Nothing should be held open by a simulation. Without this the process
    // refuses to exit in tests and in a container shutdown.
    if (typeof timer.unref === 'function') timer.unref();
  };

  const stopClock = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    simulator.stop();
  };

  io.on('connection', (socket) => {
    clients += 1;

    // A client that has just connected needs to know the server agrees,
    // separately from the transport being open, so the UI can distinguish
    // LIVE from merely CONNECTED.
    socket.emit('system:ready', {
      at: new Date().toISOString(),
      simulated: true,
      bufferedEvents: buffer.length,
    });

    // Replay the recent past so the screen is not empty on arrival. Marked
    // `replayed` so the UI can render it as context rather than as things
    // happening right now.
    buffer.forEach(({ channel, payload }) => {
      socket.emit(channel, { ...payload, replayed: true });
    });

    // The clock only runs while somebody is watching. A simulation ticking
    // into an empty room is pure waste on a free-tier dyno.
    startClock();

    socket.on('disconnect', (reason) => {
      clients = Math.max(0, clients - 1);
      if (clients === 0) stopClock();
      if (reason === 'server namespace disconnect') return;
      console.warn(`[sentinel] socket ${socket.id} disconnected: ${reason}`);
    });
  });

  return {
    simulator,
    get clients() {
      return clients;
    },
    get buffered() {
      return buffer.length;
    },
    stop: stopClock,
  };
}

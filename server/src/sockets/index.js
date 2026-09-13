/**
 * Socket surface.
 *
 * The event contract lives in docs/REALTIME_EVENTS.md and is the thing the
 * frontend codes against; this file is only the wiring. Handlers for
 * incidents, events, metrics and response actions arrive with their own
 * feature branches.
 */
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // A client that has just connected needs to know the server agrees,
    // separately from the transport being open, so the UI can distinguish
    // LIVE from merely CONNECTED.
    socket.emit('system:ready', { at: new Date().toISOString() });

    socket.on('disconnect', (reason) => {
      if (reason === 'server namespace disconnect') return;
      console.warn(`[sentinel] socket ${socket.id} disconnected: ${reason}`);
    });
  });
}

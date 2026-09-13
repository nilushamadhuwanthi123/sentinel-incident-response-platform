# Real-time event contract

This is the interface between the server and the client. Both sides code
against this document, not against each other's source.

> **Everything on this channel is simulated.** SENTINEL has no real
> telemetry, no vulnerability scanner and no threat-intelligence feed. The
> feed is a scripted scenario defined in `server/src/simulation/scenario.js`,
> and every payload carries `simulated: true` so the interface can say so
> honestly wherever it renders.

## Transport

Socket.IO 4 over WebSocket, falling back to polling. Reconnection and
backoff are socket.io's own — deliberately not reimplemented, because a
second backoff implementation racing the built-in one is a well-known way
to end up with duplicate connections.

CORS origins must be named explicitly in `CORS_ORIGINS`. There is no
wildcard fallback: a deployment that forgets the variable fails loudly
rather than quietly accepting every origin on the internet.

## Channels

| Channel | Direction | Payload | Meaning |
|---|---|---|---|
| `system:ready` | → client | `{ at, simulated, bufferedEvents }` | The server agrees the connection is usable. Distinct from the transport being open. |
| `system:alert` | → client | `{ level, message, at, simulated }` | Something about the simulation itself — a replay wrapping, for example. |
| `event:new` | → client | see below | One raw security event. |
| `service:statusChanged` | → client | `{ service, status, reason, at }` | A service changed health. |
| `event:correlated` | → client | `{ candidateId, eventIds }` | Reserved: server-side correlation. Correlation currently runs on the client. |
| `incident:new` / `incident:updated` | → client | incident | Reserved for the persisted incident record. |
| `metric:updated` | → client | `{ metric, value, at }` | Reserved for the metrics stream. |
| `risk:changed` | → client | `{ score, band, at }` | Reserved; risk is currently derived client-side from events. |
| `response:started` / `response:completed` | ↔ | `{ responseId, incidentId }` | Reserved for response actions. |

Channels marked *reserved* are declared here and listened for by the
client, but nothing emits them yet. They are listed because a channel name
that exists in one place and not the other is a silent no-op that looks
exactly like a server which never sent anything.

### `event:new`

```json
{
  "id": "scn-credential-attack-1-4",
  "at": "2026-09-13T09:00:38.000Z",
  "type": "FAILED_LOGIN",
  "service": "auth",
  "sourceIp": "203.0.113.47",
  "userId": "svc-billing-admin",
  "sessionId": "sess-8841",
  "scenarioId": "scn-credential-attack",
  "sequence": 5,
  "of": 18,
  "simulated": true
}
```

`sourceIp`, `userId` and `sessionId` are the fields the correlation engine
groups on. Ambient noise deliberately carries none of the attack's
identity — if it did, it would cluster with the attack and the engine would
appear to work for the wrong reason.

On reconnection the server replays its recent buffer with `replayed: true`
added, so the client can render it as context rather than as things
happening right now.

## Connection states

The client distinguishes five states, because "connected" is not the
question an analyst is asking. The question is *can I trust what is on
screen*.

| State | The socket | The data |
|---|---|---|
| `CONNECTING` | opening | none yet |
| `LIVE` | open, recently heard from | current |
| `STALE` | open | **not current** — nothing for 45s |
| `RECONNECTING` | dropped, retrying | last known |
| `OFFLINE` | dropped, gave up after 5 attempts | historical |

`STALE` is the state that matters. A socket can be perfectly open while the
server has said nothing for two minutes; reporting that as "connected"
would be true and useless. The state machine lives in
`frontend/src/engines/connectionState.js` as a pure reducer over transport
events plus the current time, which is why every transition above has a
test that needs neither a socket nor a wait.

## Lifecycle

The simulation clock runs only while at least one client is connected. A
simulation ticking into an empty room is pure waste on a free tier, and the
interval is `unref`'d so it can never hold the process open.

One simulator serves every client. Per-socket simulators would mean two
analysts looking at the same incident seeing different events, which
defeats the point of a shared operations picture.

## Catch-up

If the process is suspended and resumes 10 minutes later, the backlog is
**dropped, not delivered**. Events older than 30 seconds are skipped and
counted. An operations console showing a ten-minute-old burst as current is
worse than one that admits it skipped ahead.

## Determinism

The simulator's randomness comes from a seeded Mulberry32 PRNG, never
`Math.random`. The same seed produces the same feed, which is what makes an
end-to-end test of a "live" system possible at all — and an intermittently
failing socket test is a test everyone learns to ignore.

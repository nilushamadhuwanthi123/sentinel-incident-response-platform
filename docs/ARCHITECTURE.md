# Architecture

## Shape

```
┌──────────────────────────────────────────────────────────────┐
│  frontend/  React + Vite                                     │
│                                                              │
│   pages/          route-level composition                    │
│   components/     presentation, grouped by system            │
│   engines/        pure logic — no React, no DOM, no network   │
│   hooks/          React bindings over engines and services   │
│   services/       HTTP and socket clients                    │
│   context/        cross-cutting state                        │
│   styles/         design tokens                              │
└───────────────┬──────────────────────────────────────────────┘
                │  REST for state, Socket.IO for change
┌───────────────▼──────────────────────────────────────────────┐
│  server/  Express + Socket.IO                                │
│   routes/   REST endpoints                                   │
│   sockets/  real-time event surface                          │
│   data/     store (in-memory simulation, or MongoDB Atlas)   │
└──────────────────────────────────────────────────────────────┘
```

## The rule that shapes everything

**Business rules do not live in components.**

Risk scoring, event correlation, recommendation, simulation, posture and
challenge scoring are pure functions in `frontend/src/engines/`. They take
data and return data. They import no React, touch no DOM, and make no
network calls.

This is not tidiness for its own sake. It buys three things:

1. **They are testable without rendering anything.** A boundary condition in
   the risk engine is a unit test, not a browser click.
2. **They are re-runnable.** The what-if simulator works by running the same
   risk engine against a hypothetical state — which is only possible because
   the engine does not reach into live state to do its job.
3. **They can be explained.** Every engine returns not just a result but the
   reasoning behind it: which rules matched, which factors contributed, and
   by how much. The UI renders that reasoning rather than inventing it.

Components render engine output. Hooks connect engine output to React state.
Services move data. Nothing else calculates.

## Engines

| Engine | Answers |
|---|---|
| `severity.js` | What does this 0–100 score mean, on one shared scale? |
| `riskEngine.js` | How risky is this, and which factors made it so? |
| `correlationEngine.js` | Are these separate events actually one incident, and why? |
| `recommendationEngine.js` | What should the analyst do next, and what would it achieve? |
| `simulationEngine.js` | What would happen if we did that — without doing it? |
| `postureEngine.js` | How strong is our overall position, and what is dragging it down? |
| `challengeEngine.js` | How good was this analyst's decision-making? |

`severity.js` lands first and is depended on by all the others: it owns the
band thresholds so that no two surfaces can disagree about what 74 means.

## State and real time

REST answers *what is true now*. The socket reports *what just changed*.
The client holds one authoritative view and applies socket deltas to it,
rather than maintaining two copies that can drift.

Connection state is itself surfaced — `LIVE`, `RECONNECTING`, `OFFLINE`,
`STALE` — because an operations interface that silently shows stale numbers
is worse than one that admits it lost the connection.

The event contract is documented in `REALTIME_EVENTS.md`.

## Simulation, not surveillance

SENTINEL runs on simulated operational and security telemetry. It does not
scan real infrastructure, does not perform vulnerability assessment, and
does not claim to. What it does implement for real is the reasoning layer:
scoring, correlation, dependency impact, recommendation and decision
simulation, all running on data the platform can actually see.

`SECURITY_MODEL.md` states the boundary precisely.

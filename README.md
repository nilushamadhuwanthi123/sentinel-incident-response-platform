<div align="center">

# SENTINEL

### Detect. Understand. Respond. Resolve. Learn.

**A real-time cyber incident detection, investigation, response and observability platform.**

[![CI](https://github.com/nilushamadhuwanthi123/sentinel-incident-response-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/nilushamadhuwanthi123/sentinel-incident-response-platform/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18-1f2418?logo=react&logoColor=C7F000)](https://react.dev)
[![Node](https://img.shields.io/badge/Node-20%2B-1f2418?logo=node.js&logoColor=76E06F)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-1f2418?logo=socketdotio&logoColor=D4A72C)](https://socket.io)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-open-C7F000?logoColor=0B0D0A)](https://nilushamadhuwanthi123.github.io/sentinel-incident-response-platform/)
[![License](https://img.shields.io/badge/License-MIT-1f2418)](LICENSE)

</div>

---

## The problem

When something goes wrong in a live system, the signals arrive separately
and mean nothing on their own.

A handful of failed logins is noise. An unfamiliar IP address is noise. A
privileged account reading a sensitive endpoint is, most days, someone doing
their job. An analyst watching a feed sees twenty-seven such lines scroll
past and has no way to know that together they are one credential attack
that started four minutes ago and is now two steps from the database.

The gap is not detection. Most platforms will happily show every one of
those events. The gap is **understanding**: which events belong together,
why the risk is what it is, what will break if this service goes down, and
what the next action should actually be.

## What SENTINEL does

It closes that gap, and it shows its working.

- **Correlates** related events into a single incident, and renders *why*
  they were judged related rather than hiding the logic in code.
- **Scores risk** from likelihood, impact and exposure — and lists the
  individual contributors that produced the score, and the defensive actions
  that would reduce it.
- **Maps dependencies**, so the blast radius of a compromised service is
  visible on the topology rather than discovered afterwards.
- **Simulates a response before it is executed**, so an analyst can see the
  projected risk reduction of locking an account or blocking a source
  without committing to either.
- **Reconstructs the incident** once it is over, as a timeline that can be
  replayed.

Everything it concludes, it can explain. Nothing is presented as knowledge
the platform does not have.

> **Scope.** SENTINEL runs on simulated operational and security telemetry.
> It is a portfolio-grade defensive incident-response and operations
> platform — it does not scan real infrastructure and makes no vulnerability
> assessment claims. See [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

---

## Status

Shipped and deployed. Every system below reached `main` through its own issue,
branch and reviewed pull request.

| | |
|---|---|
| Design tokens & severity scale | ✅ merged |
| CI (lint · test · build) | ✅ merged |
| Command Center · Radar · Topology | ✅ merged |
| Risk · Correlation · Recommendation engines | ✅ merged |
| Investigation · Forensics · Simulation | ✅ merged |
| Incident operations · Observability · Audit trail | ✅ merged |
| Deployment | ✅ [live on GitHub Pages](https://nilushamadhuwanthi123.github.io/sentinel-incident-response-platform/) |

The deployed build runs with no backend configured, so it executes the
server's own simulator in the browser — the same module, not a second copy of
it. Every screen says so before it says anything else.

---

## Technology

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + Vite | Fast iteration; the interface is genuinely component-shaped |
| Logic | Plain JavaScript modules | Engines stay framework-free, so they are testable and re-runnable |
| Real time | Socket.IO | Reconnection and fallback handled, which a raw WebSocket leaves to you |
| API | Express | Small surface; the interesting work is in the engines |
| Store | In-memory simulation, MongoDB Atlas optional | Runs with zero setup; persists when configured |
| Tests | Vitest + Testing Library | Same runner as the build tool |
| CI | GitHub Actions | Lint, test and build on every pull request |

## Project structure

```
frontend/
  src/
    components/   command · radar · topology · risk · investigation ·
                  forensics · graphs · assistant · simulation ·
                  challenge · shared
    pages/
    engines/      riskEngine · correlationEngine · recommendationEngine ·
                  simulationEngine · postureEngine · challengeEngine
    hooks/        useSocket · useIncident · useRisk · useTopology ·
                  useCommandPalette
    services/     incidentService · eventService · socketService ·
                  metricsService
    context/
    styles/       design tokens
server/
  src/
    routes/       REST
    sockets/      real-time event surface
    data/         store
docs/
```

Business rules do not live in components. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why that constraint
shapes the whole codebase.

---

## Running locally

Requires Node 20+.

```bash
git clone https://github.com/nilushamadhuwanthi123/sentinel-incident-response-platform.git
cd sentinel-incident-response-platform
cp .env.example .env
```

```bash
cd server && npm install && npm run dev      # http://localhost:4000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The server runs against an in-memory simulation store by default — no
database needed to develop or demo. Set `MONGODB_URI` to persist.

### Environment

| Variable | Used by | Notes |
|---|---|---|
| `PORT` | server | Defaults to 4000 |
| `CORS_ORIGINS` | server | Comma-separated. Must include the deployed frontend origin |
| `MONGODB_URI` | server | Optional. Empty means in-memory |
| `VITE_API_URL` | frontend | Server base URL |
| `VITE_SOCKET_URL` | frontend | Socket URL |

`.env` is gitignored. No secret is ever committed.

### Testing

```bash
cd frontend && npm test        # engines and components
cd frontend && npm run lint
cd frontend && npm run build
```

---

## Team

| | Role | Owns |
|---|---|---|
| **Nilusha Madhuwanthi** — [`nilushamadhuwanthi123`](https://github.com/nilushamadhuwanthi123) | Intelligence, Investigation & Experience Engineer | Command Center · Threat Radar · Topology · Blast Radius · Correlation · Risk & Trajectory · Investigation Workspace · Attack Chain · Relationship Graph · Forensics Desk · SENTINEL Assist · Recommendation · What-If & Failure Simulation · Incident Story & Replay · Challenge · Security Posture · Command Palette · Real-time client integration |
| **Kavindu Maduhansa** — [`kavindu-maduhansa`](https://github.com/kavindu-maduhansa) | Platform, Incident Operations & Observability Engineer | Platform, incident operations and observability systems |

Work reaches `main` only through reviewed pull requests. See
[`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md).

## Documentation

| | |
|---|---|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System shape and the engine boundary |
| [`GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) | Branches, commits, review, attribution |
| `INTELLIGENCE_ENGINES.md` | Risk, correlation, recommendation — with the maths |
| `INVESTIGATION_WORKFLOW.md` | How an analyst moves through an incident |
| `REALTIME_EVENTS.md` | Socket event contract |
| `ACCESSIBILITY.md` | Keyboard, screen reader, reduced motion, contrast |
| `TESTING.md` | What is tested and why |
| `SECURITY_MODEL.md` | What this platform does and does not claim |
| `DEMO_GUIDE.md` | The five-minute walkthrough |

*(Documents arrive with the systems they describe, so they cannot drift.)*

## License

[MIT](LICENSE)

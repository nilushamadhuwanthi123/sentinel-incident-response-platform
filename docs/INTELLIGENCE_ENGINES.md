# Intelligence engines

Every engine in SENTINEL is a pure module in `frontend/src/engines/`. No
React, no DOM, no network, no reads of live state. They take data and return
data — including the reasoning behind the result.

That constraint is what makes the what-if simulator possible: it re-runs the
same risk function against a hypothetical incident, and because the function
has no side effects, simulating a response cannot change the real one.

---

## Severity scale — `severity.js`

One 0–100 scale, four bands, owned in one place so no two surfaces can
disagree about what 74 means.

| Band | Range |
|---|---|
| LOW | 0–24 |
| MEDIUM | 25–49 |
| HIGH | 50–74 |
| CRITICAL | 75–100 |

Unusable input clamps to **0**, never to a reassuring mid-scale 50, and
never throws inside a render. Numeric strings are accepted, because socket
payloads routinely carry them.

---

## Risk engine — `riskEngine.js`

```
risk = likelihood × 0.40 + impact × 0.35 + exposure × 0.25
```

Normalised to 0–100 and banded by the severity scale.

### Where the factors come from

Either the caller supplies them, or the engine derives them from observed
signals. Explicit factors win — an incident that arrives from the server
with assessed factors is not silently re-derived by the client.

Each signal in the catalogue carries what it says about each factor. These
are operational judgements, not measurements, and they live in one table so
they can be argued with and tuned rather than being scattered through
components:

| Signal | Likelihood | Impact | Exposure |
|---|---|---|---|
| Repeated failed authentication | 26 | 4 | 6 |
| Unknown external IP | 22 | 6 | 24 |
| Privileged account involved | 10 | 34 | 18 |
| Sensitive resource accessed | 8 | 32 | 22 |
| Data store reached | 4 | 30 | 14 |
| Privilege escalation observed | 18 | 28 | 12 |
| Activity spans multiple services | 8 | 22 | 16 |
| Internet-facing service | 6 | 8 | 28 |
| Activity outside normal hours | 14 | 2 | 4 |
| No second factor on the identity | 16 | 8 | 18 |
| Event rate far above baseline | 20 | 8 | 6 |

An unrecognised signal is **dropped**, not guessed at, and reported in
`explanation.unrecognisedSignals`. An engine that invents a weight for
something it does not recognise is worse than one that admits it saw
nothing.

### Saturation

`REPEATED_AUTH_FAILURE` scales with the observed count, logarithmically and
with a ceiling of 1.6×. Twenty-seven failed logins are much worse than one.
Twenty-seven thousand are not a thousand times worse than twenty-seven —
they are the same attack, still running.

### Contributors — the part that makes it explainable

The engine attributes the score across the signals that produced it:

```
Repeated failed authentication   +21
Privileged account involved      +20
Sensitive resource accessed      +20
Unknown external IP              +17
No second factor on the identity +14
                                 ───
                                  92
```

Those points are scaled so that **they actually add up to the score**. When
a factor saturates at 100, nominal signal weights would overshoot the real
total, and a breakdown that overshoots is a breakdown that lies. The scaling
is reported in `explanation.attributionScaled`, and each contributor keeps
its `nominalPoints` alongside its attributed `points`.

A test asserts the sum, so the explanation cannot drift away from the number
it explains.

### Reducers

Defensive actions reduce the **factors**, not the score directly, and the
score is then re-weighed. Locking an account genuinely lowers the likelihood
of continued compromise; it does not change how sensitive the data already
reached was. Expressing reductions per factor is what keeps that honest.

| Action | Likelihood | Impact | Exposure | Reversible | Service impact |
|---|---|---|---|---|---|
| Lock the affected account | −46 | −6 | −12 | yes | low |
| Block the source address | −30 | −2 | −38 | yes | low |
| Revoke active sessions | −28 | −12 | −14 | no | medium |
| Rotate affected credentials | −22 | −16 | −20 | no | medium |
| Isolate the affected service | −18 | −34 | −30 | yes | high |
| Enforce second factor | −20 | −4 | −16 | yes | low |

Reducers are returned with negative point values, reversibility, service
impact and confidence — which is exactly what the decision impact matrix
renders.

### Risk trajectory

`computeTrajectory(points)` runs the same engine across an ordered sequence
of observations, so an analyst can see when risk moved and what moved it:

```
09:41   21  LOW        first signal
09:43   38  MEDIUM     unknown source identified
09:47   92  CRITICAL   privileged identity, sensitive resource
09:56   34  MEDIUM     account locked, source blocked
```

### Guarantees, each covered by a test

- The score never leaves 0–100.
- Out-of-range factors clamp; unusable ones become 0 rather than throwing.
- `signals` and `responses` that are not arrays do not crash the engine.
- The engine does not mutate its input.
- The engine is deterministic.
- Contributors are ordered by contribution and sum to the base score.
- Combined actions never reduce risk less than either action alone.

---

## Correlation engine — `correlationEngine.js`

Twenty-seven failed logins are noise. An unfamiliar IP is noise. A
privileged account reading a sensitive endpoint is, most days, someone doing
their job. Together they are one credential attack, and nothing in a
scrolling feed makes that connection.

### How it works

1. **Group.** Events are clustered by the entities they share — source
   address, identity, session — within a time window (default 10 minutes).
   Grouping is **transitive**: if A and B share an IP and B and C share a
   session, all three belong to one cluster. That is what lets a single
   incident be assembled from events with no one field in common.
2. **Evaluate.** Every rule runs against the cluster and returns whether it
   matched *and the evidence it matched on*.
3. **Classify.** The most specific pattern whose required rules all matched
   wins, so "possible credential attack" is preferred over the vaguer
   "correlated activity" — but only when it is earned.

### Rules

| Rule | Weight | Matches when |
|---|---|---|
| `SHARED_SOURCE_IP` | 18 | every event shares one source address |
| `SHARED_IDENTITY` | 20 | every event involves one identity |
| `SHARED_SESSION` | 14 | every event belongs to one session |
| `AUTH_FAILURE_BURST` | 22 | ≥5 authentication failures |
| `EXTERNAL_ORIGIN` | 16 | the source is unrecognised |
| `PRIVILEGED_IDENTITY` | 20 | a privileged identity is involved |
| `SENSITIVE_RESOURCE` | 22 | a sensitive resource was reached |
| `ESCALATION_SEQUENCE` | 24 | failure → escalation → access, **in that order** |
| `MULTI_SERVICE_SPREAD` | 14 | activity touches ≥3 services |
| `RAPID_SEQUENCE` | 12 | ≥6 events inside 60 seconds |

`ESCALATION_SEQUENCE` checks order, not just presence. The same three event
types in a different sequence are not that pattern, and saying they are
would be wrong — there is a test for exactly this.

### Patterns

| Pattern | Requires |
|---|---|
| Possible credential attack | burst + external origin + privileged identity |
| Possible privilege abuse | privileged identity + sensitive resource |
| Possible escalation chain | escalation sequence |
| Possible brute-force attempt | burst |
| Activity across multiple services | multi-service + shared identity |

### Confidence

Matched weight as a share of everything that *could* have matched. It falls
as the rule set grows, which is correct: more ways to be wrong means less
certainty from the same evidence. Candidates below the floor (default 40)
are dropped.

### Reasoning is data, not prose

```js
reasoning: [
  { rule: 'ESCALATION_SEQUENCE', label: '…', detail: '…', weight: 24, eventIds: [...] },
  { rule: 'AUTH_FAILURE_BURST',  label: '…', detail: '27 failed authentications', weight: 22, eventIds: [...] },
]
```

The correlation visualisation renders this. A reader must be able to see
*why* events were judged related, not be asked to trust it.

### It feeds the risk engine

A candidate emits `riskSignals` in exactly the shape `computeRisk` consumes,
including the observed failure count:

```js
riskSignals: [
  { id: 'REPEATED_AUTH_FAILURE', count: 27 },
  'UNKNOWN_EXTERNAL_IP',
  'PRIVILEGED_ACCOUNT',
  'SENSITIVE_RESOURCE_ACCESS',
]
```

Correlation decides *what was observed*; risk decides *what it is worth*.
Neither re-derives the other's job.

### Guarantees, each covered by a test

- Unrelated events do not correlate.
- Events outside the window are separate candidates, even sharing an entity.
- A rule that throws is reported as unmatched rather than losing the whole
  correlation.
- Timestamps accept ISO strings, epoch milliseconds and `Date`; unusable
  ones are discarded and counted in `stats.discarded`.
- The engine does not mutate its input and is deterministic.

---

## Recommendation, simulation, posture, challenge

Documented here as each lands, with the same standard: the rules written
down, the reasoning returned as structured data, and the guarantees tested.

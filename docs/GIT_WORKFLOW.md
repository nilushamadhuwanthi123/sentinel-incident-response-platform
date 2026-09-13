# Git workflow

## Branches

`main` is the default branch and is protected. It must always build, pass
tests and be deployable. Nothing is developed directly on it.

Feature work happens on a branch named for what it delivers:

```
feat/<system>      new capability            feat/threat-radar
fix/<problem>      a real defect             fix/socket-duplicate-events
test/<area>        test coverage             test/correlation-engine
perf/<area>        measured optimisation     perf/graph-rendering
docs/<area>        documentation             docs/realtime-events
chore/<area>       tooling, config           chore/ci-pipeline
```

A branch exists to deliver one coherent system. It is not created to change
a single line, and twenty unrelated systems are not bundled into one.

## Commits

Conventional Commits, scoped to the system:

```
feat(risk): implement weighted risk calculation
feat(risk): expose risk contributors
test(risk): cover severity boundaries
fix(risk): clamp invalid score ranges
```

Atomic and meaningful. Not one commit for an entire feature, and not a
hundred commits that each move a bracket.

## Lifecycle

```
issue → branch → implementation → tests → commits → PR →
human review → fixes if requested → merge → issue closed
```

Every PR closes its issue with `Closes #n`. Merged branches are deleted;
the history stays in the PR.

## Review

Two people work on this repository:

| | |
|---|---|
| **Nilusha Madhuwanthi** (`nilushamadhuwanthi123`) | Intelligence, Investigation & Experience Engineer |
| **Kavindu Maduhansa** (`kavindu-maduhansa`) | Platform, Incident Operations & Observability Engineer |

Each requests the other as reviewer on substantial PRs. Review is real: an
approval means a person read the diff. Requested changes are addressed with
follow-up commits on the same branch, never by force-pushing over the
history a reviewer already read.

## Attribution

Commits carry the identity of the human who did and directed the work.
`Co-authored-by:` is used only when both humans genuinely worked on the same
change — never to inflate a contribution graph, and never for tooling.

## Before merging

- `npm run lint` clean in the package you touched
- `npm test` passing
- `npm run build` succeeding
- the affected views checked at desktop and mobile width
- no console errors in the browser

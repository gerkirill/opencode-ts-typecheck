# ADR 0012: Bound remediation and retain unresolved outcomes

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

An agent may fail to repair errors, ignore feedback, or make a different failing
edit each time. The pre-idle hook will run again after each completion attempt.
Infrastructure failure is not the same as a compiler diagnostic or a passing check.

## Decision

Distinguish passed, failed, and unresolved checks. Permit three remediation
admissions by default, configurable up to ten. Count admissions independently of
file fingerprints; increment before admitting feedback.

Retain unchanged failures without rerunning the compiler unnecessarily. Reset
episode budgets only on verified success or a genuine new user request, never
on synthetic feedback or a new failing fingerprint.

Latch terminal state before reporting exhaustion or unresolved infrastructure.
Store an instruction entry and admit one terminal synthetic status message asking
for an honest final report; this is separate from the repair budget.
Keep session state in memory rather than persisting it across host reloads.

## Alternatives considered

- **Retry until success:** can consume unbounded model usage and never finish.
- **Reset for every edit/model step:** lets unsuccessful repairs defeat the cap.
- **Treat inability to check as success:** conceals unresolved validation.
- **Only write a terminal instruction entry:** may never be consumed when there
  is no further model step.
- **Persist retry state:** improves restart continuity, but needs durable episode
  identity, cleanup, and recovery semantics beyond this release.

## Consequences

Exhaustion deliberately allows completion with unresolved errors; repair is not
guaranteed. A terminal status admits one reporting continuation, but not endless gate
admissions. Reloads reset budgets, and per-session/directory maps live until unload.
Permission denial and interruption propagate rather than becoming repair prompts.

## References

- [Outcome and budget policy](../../src/gate.ts)
- [Persistent status and synthetic adapter](../../src/index.ts)
- [Budget, reset, and terminal tests](../../tests/gate.test.ts)

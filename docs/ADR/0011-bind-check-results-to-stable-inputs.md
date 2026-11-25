# ADR 0011: Bind command selection and results to stable inputs

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Sessions can share a directory, and files may change during permission approval,
lock waiting, or compilation. A zero exit from an old command against different
inputs must not be accepted as validation of the new project state.

## Decision

Serialize state transitions per session and checker execution per directory.
Associate command selection with the current input fingerprint.
After permission and directory-lock acquisition, snapshot again; if selection
is stale, release the lock, reselect, and reapprove without running that command.

Snapshot before and after execution. Cache a result only when these fingerprints
match. Reassess changed inputs, with a bounded validation-selection budget of
`maxAttempts * 2 + 2`. Recheck the fingerprint before admitting cached failure
diagnostics. Stable success advances the baseline and resets the episode.

## Alternatives considered

- **One global lock:** serializes unrelated projects unnecessarily.
- **Only a per-session lock:** permits overlapping checks in one directory.
- **Only before/after compiler snapshots:** misses a command selected before
  approval against a different package script or manager.
- **Cache by directory or command name:** can reuse results for unchecked inputs.

## Consequences

A review-reproduced stale-command false success is explicitly prevented.
Permission waits do not block other sessions' checks. The semaphore does not
lock out agent/external edits, and snapshots do not provide filesystem isolation.
Repeated churn can exhaust the bounded budget and end as unresolved.

## References

- [Semaphores and fingerprint checks](../../src/gate.ts)
- [Approval, lock-wait, and stale-success regressions](../../tests/gate.test.ts)
- [Review evidence](../verification.md)

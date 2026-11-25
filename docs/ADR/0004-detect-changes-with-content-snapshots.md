# ADR 0004: Detect changes with content snapshots

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Edits can come from patch tools, shell commands, or other execution paths.
Projects may already contain uncommitted changes, and Git need not be available.
The gate should not run merely because a project started dirty.

## Decision

Hash a sorted collection of relevant relative paths and file contents using
SHA-256. Length-prefix path and content data to avoid ambiguous concatenation.
Capture the initial baseline before the first primary model call and retain it
across model steps. Compare later snapshots at the completion boundary.

Latch detected changes until a verified passing check advances the baseline.
Cache the result for an unchanged checked fingerprint, including failures.
A new genuine user request starts a new baseline and state epoch.

## Alternatives considered

- **Git status/diff:** convenient, but preexisting edits and repository dependence
  complicate identifying changes made during this request.
- **Filesystem watchers:** can provide immediate signals, but introduce event
  ordering, missed-event, platform, and lifetime concerns.
- **Tool hooks:** inexpensive, but tool-name-specific and can miss shell edits.
- **Modification times or sizes:** cheaper scans, but metadata alone is not a
  reliable indication that contents differ.
- **Hash every project file:** broader coverage at higher cost and more noise.

## Consequences

Additions, deletions, path changes, and content edits affect the fingerprint.
Repeated scans cost filesystem IO; no benchmark establishes suitability for
very large trees. Snapshots establish changed inputs, not which actor wrote them,
and are not atomic filesystem transactions.

## References

- [Snapshot implementation](../../src/changes.ts)
- [Baseline and cached results](../../src/gate.ts)
- [Change tests](../../tests/changes.test.ts)

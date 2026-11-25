# ADR 0016: Skip unsupported projects before scanning

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Global plugin installation must not recursively traverse large Python, Rust,
or other unsupported projects. Previously, eligibility was discovered only
after snapshots, and JSON edits could trigger missing-config status turns.

## Decision

Before the initial snapshot, probe only root `package.json` and the existence
of root `tsconfig.json`. A nonempty `scripts.typecheck` or root config activates
the existing gate. No recursive discovery, ancestor search, tool resolution, or
lockfile inspection belongs in this probe.

Cache applicability in the per-session request state, under its existing lock.
Unsupported requests quietly skip all snapshots and checker operations. Only a
genuine user prompt resets the decision; synthetic turns do not. Newly added
support takes effect on the next user request.

Preserve explicit metadata errors as unresolved, without scanning. For applicable
requests, retain command selection, permissions, stable-input validation, retry
accounting, directory safety, and cancellation. Never cache an execution command
from the applicability probe.

## Alternatives considered

- **Probe at every completion:** detects newly introduced support sooner, but adds
  repeated IO and needs a separate initial-check policy without a prior baseline.
- **Search nested projects or infer ecosystems:** reintroduces tree-size-dependent
  work and expands the existing session-root contract.
- **Treat all probe failures as unsupported:** hides broken explicit configuration.
- **Cache forever:** misses support added between genuine user requests.

## Consequences

Unsupported-request IO is limited to root metadata and does not scale with tree
size. Hook dispatch, root-manifest parsing, and small session state still cost
resources. Nested-only TypeScript projects require a root script or a session
located in the package. Configuration introduced mid-request waits until the
next genuine prompt; configuration removed after activation remains subject to
the existing unresolved-check policy.

Deterministic IO counters and real-filesystem fixtures establish that skipped
requests never reach snapshots, command selection, permissions, checks, or
synthetic diagnostics. They do not constitute a measured latency benchmark.

## References

- [Applicability probe](../../src/checker.ts)
- [Request gate](../../src/gate.ts)
- [Gate tests](../../tests/gate.test.ts)
- [Probe and command tests](../../tests/checker.test.ts)

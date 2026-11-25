# ADR 0010: Bound and cancel checker subprocesses

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Compilers and package scripts can hang, produce large output, or spawn children
that keep pipes open after the direct child exits.

## Decision

Run each command as a child process with explicit cwd and arguments.
Default to a 60-second timeout and a combined 16,384-byte stdout/stderr capture
limit, with validated upper bounds. Continue draining output after the cap.

On non-Windows hosts, create a separate process group and kill it on timeout,
abort, spawn failure, or direct-child exit to clean up descendants.
Use direct child killing as the Windows fallback. External abort rejects;
timeout, startup failure, and signal termination produce unresolved results.

## Alternatives considered

- **Run in the host process:** couples compiler failure and resource use to the host.
- **Kill only the direct child everywhere:** can leave grandchildren alive or
  waiting pipes open.
- **Allow unbounded time/output:** risks blocking completion and flooding context.
- **Stop reading when the output cap is reached:** can block a child writing into
  full pipes.

## Consequences

Returned diagnostics may be incomplete, and forced termination does not roll back
side effects. Validation scripts must not expect background children to outlive
the check. Process-group cleanup is tested on Linux; Windows descendant cleanup
is not equivalent or certified. Descendants that deliberately detach into their
own process groups are outside that cleanup guarantee.

## References

- [Process lifecycle](../../src/checker.ts)
- [Option bounds](../../src/gate.ts)
- [Real subprocess tests](../../tests/checker.test.ts)

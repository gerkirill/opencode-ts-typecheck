# ADR 0009: Use the Effect SDK and a separate gate core

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The gate awaits permission, locks, filesystem work, and compiler processes.
Stopping a session or unloading the plugin must not leave validation running
and later inject an unexpected continuation.

## Decision

Use the Effect-native plugin SDK. Keep SDK registration and transport adaptation
in `index.ts`, state orchestration behind an Effect-based IO interface in
`gate.ts`, and filesystem/process work in `changes.ts` and `checker.ts`.

Adapt cancellable Promise operations with `Effect.tryPromise` and its signal.
Race active callbacks against plugin unload and state invalidation. Genuine new
user input invalidates the previous state epoch. Preserve interruption rather
than treating it as compiler diagnostics.

## Alternatives considered

- **Promise SDK hooks:** simpler-looking callbacks, but their session-hook API
  does not expose the cancellation signal needed here.
- **Only check a generation counter after work:** suppresses some stale results
  but does not stop the underlying work.
- **Put all behavior in the SDK entrypoint:** fewer modules, but makes policy
  testing depend on a running host and obscures execution boundaries.

## Consequences

Effect introduces runtime/version coupling and a functional concurrency model.
The small IO boundary allows deterministic gate tests without pretending to
exercise the real host scheduler. Once diagnostics are durably admitted,
cancellation cannot retroactively retract them.

## References

- [Effect adapter and unload finalizer](../../src/index.ts)
- [Gate IO and epoch invalidation](../../src/gate.ts)
- [Fiber, cancellation, and registration tests](../../tests/gate.test.ts)

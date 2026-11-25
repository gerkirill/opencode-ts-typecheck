# ADR 0003: Admit continuations without an additional wake

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The meaning of `resume` is easy to confuse with message admission. The plugin
must continue the agent, but it is already inside an awaited, active execution.

## Decision

Use `session.synthetic` with explicit `resume: false` for repair requests and
terminal status messages admitted by the gate.

Synthetic input is durably admitted with either value. `true`, also the default
when omitted, additionally requests execution scheduling. Inside the pre-idle
hook, the running execution consumes the newly admitted input when the hook
returns; an additional wake is unnecessary.

Both values can lead back to the hook after subsequent model work. Enforce
termination through independent gate state, never through the `resume` flag.

## Alternatives considered

- **Set `resume: true`:** appropriate for waking an already-idle session, and also
  capable of continuation here, but requests scheduling this boundary does not need.
- **Omit the flag:** obscures the intentional distinction between admission and wake.
- **Wait for session completion inside the hook:** would wait on an execution
  whose completion is itself blocked by that hook.

## Consequences

This choice is specific to admission inside the active pre-idle hook; it is not
guidance to use `false` when sending work to an already-idle session.
The live 2.4.1 scenario verified a repair without another user prompt or
intermediate persisted idle. Loop prevention remains a separate responsibility.

## References

- [Synthetic admissions](../../src/index.ts)
- [Retry policy](0012-bound-remediation-and-retain-unresolved-outcomes.md)
- [Live verification and resume-harness limits](../verification.md)

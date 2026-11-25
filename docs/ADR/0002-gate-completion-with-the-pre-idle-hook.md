# ADR 0002: Gate completion with the pre-idle hook

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Reporting type errors after completion is insufficient: the agent must receive
the diagnostics and continue repairing them before its execution finishes.

## Decision

Register the server-side `experimental.idle` session hook. On OpenCode 2.4.1,
the runner awaits this hook immediately before completion and rechecks pending
input afterward. Admit synthetic diagnostics through that boundary.

Capture the initial input snapshot through the primary model-context hook;
use the user-prompt hook to distinguish new requests from repair continuations.
Do not implement a replacement language server or change OpenCode core.

## Alternatives considered

- **Subscribe to an idle event and then prompt:** acts after idle and starts
  another execution rather than enforcing the required completion boundary.
- **Typecheck after every edit/tool call:** earlier feedback, but repeated checks
  on incomplete work and dependence on particular editing tools.
- **Agent instructions or a custom check tool alone:** simpler, but relies on the
  agent remembering to invoke the check before finishing.
- **Modify the host or restore full LSP integration:** a broader maintenance
  commitment than a standalone completion gate.

## Consequences

The gate covers completion after tool-driven work, not just direct file edits.
It relies on an experimental host API and needs compatibility verification on
upgrades. It is not a replacement for all per-edit LSP features.

## References

- [SDK adapter](../../src/index.ts)
- [Continuation policy](0003-admit-continuations-without-an-additional-wake.md)
- [Live verification](../verification.md)

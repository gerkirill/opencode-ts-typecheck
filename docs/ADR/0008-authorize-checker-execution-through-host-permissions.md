# ADR 0008: Authorize checker execution through host permissions

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Both package scripts and local compiler files are executable project code.
Being called by a plugin must not bypass the session's execution permissions.
Approval dialogs must not monopolize a shared checker lock.

## Decision

Assert the host's `shell` permission with the actual session, active agent,
selected command, and directory metadata before launching either execution path.
Request permission before acquiring the directory execution semaphore.

Render ordinary safe tokens without quotes so rules such as `npm run *` match;
quote unsafe tokens. Launch the selected executable with an argument array and
`shell: false`. Leave interpretation of a package script to its package manager.
Propagate permission denial; do not translate it into a type-error repair loop.

## Alternatives considered

- **Treat validation as inherently safe:** ignores arbitrary scripts and
  project-controlled compiler code.
- **Authorize package scripts but exempt `tsc`:** creates an unchecked executable path.
- **Quote every permission-resource token:** can prevent ordinary shell rules
  from matching even simple commands.
- **Parse scripts to authorize each nested executable:** unreliable for arbitrary
  shell programs; normal script execution remains the trust boundary.

## Consequences

Checks may need user approval or be denied. Authorization is not sandboxing and
does not undo script side effects. A command changed during approval must be
reselected and reapproved before execution.

## References

- [Permission assertion](../../src/index.ts)
- [Resource formatting and denial propagation](../../src/gate.ts)
- [Stable command selection](0011-bind-check-results-to-stable-inputs.md)

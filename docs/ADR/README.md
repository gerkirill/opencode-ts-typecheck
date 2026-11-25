# Architecture decision records

These records capture the decisions implemented for the first release, targeting
OpenCode 2.4.1. They are retrospective records, not proposals to change behavior.
Alternatives explain the trade-offs; listing one does not imply it was prototyped.

Each record uses a Nygard-style format extended with alternatives and references:
status, date, context, decision, alternatives considered, and consequences.
Dates refer to the implementation decision, not a future compatibility promise.

| ADR | Decision |
| --- | --- |
| [0001](0001-standalone-package-and-isolated-playground.md) | Standalone package and isolated playground |
| [0002](0002-gate-completion-with-the-pre-idle-hook.md) | Gate completion with the pre-idle hook |
| [0003](0003-admit-continuations-without-an-additional-wake.md) | Admit continuations without an additional wake |
| [0004](0004-detect-changes-with-content-snapshots.md) | Detect changes with content snapshots |
| [0005](0005-limit-input-discovery-to-the-session-directory.md) | Limit input discovery to the session directory |
| [0006](0006-prefer-the-project-typecheck-command.md) | Prefer the project typecheck command |
| [0007](0007-use-provisioned-tools-without-automatic-downloads.md) | Use provisioned tools without automatic downloads |
| [0008](0008-authorize-checker-execution-through-host-permissions.md) | Authorize execution through host permissions |
| [0009](0009-use-the-effect-sdk-and-a-separate-gate-core.md) | Use the Effect SDK and a separate gate core |
| [0010](0010-bound-and-cancel-checker-subprocesses.md) | Bound and cancel checker subprocesses |
| [0011](0011-bind-check-results-to-stable-inputs.md) | Bind command selection and results to stable inputs |
| [0012](0012-bound-remediation-and-retain-unresolved-outcomes.md) | Bound remediation and retain unresolved outcomes |
| [0013](0013-publish-source-with-host-runtime-peers.md) | Publish source with host runtime peers |
| [0014](0014-verify-boundaries-with-layered-evidence.md) | Verify boundaries with layered evidence |
| [0015](0015-publish-from-github-releases.md) | Publish from GitHub Releases |
| [0016](0016-skip-unsupported-projects-before-scanning.md) | Skip unsupported projects before scanning |

Accepted records describe the current baseline, including its limitations.
When a decision changes, add a new numbered record and mark the earlier record
superseded with a link; do not erase its original rationale.

For execution results rather than design rationale, see
[verification evidence](../verification.md).

# ADR 0014: Verify boundaries with layered evidence

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

A successful typecheck or mocked gate test cannot establish that the real host
continues an agent before idle. A linked development import does not establish
that the published artifact contains working exports.

## Decision

Use distinct evidence for distinct boundaries:

1. Typecheck the plugin and tests against the installed compatible SDK.
2. Exercise snapshot policy and gate state using deterministic IO boundaries,
   real Effect fibers, interruption, and semaphores.
3. Launch real package-manager scripts and TypeScript subprocesses for checker
   behavior, failure modes, caps, and cleanup.
4. Inspect and install the tarball, import its export, and compare shipped source.
5. Use a separately authorized, bounded live agent scenario to establish actual
   diagnostics admission, repair, and final idle ordering.

Keep paid model runs out of the routine automated suite. Record evidence and
limits in `docs/verification.md`, separately from these architectural rationales.

## Alternatives considered

- **Only mocks or a protocol harness:** fast, but cannot prove host scheduling.
- **Only a live end-to-end scenario:** realistic, but costly and nondeterministic,
  with poor coverage of cancellation, budgets, and rare races.
- **Only build/import checks:** establish structure, not agent behavior.
- **Automatically repeat paid tests until success:** obscures failed attempts and
  exceeds explicit usage authorization.

## Consequences

Evidence is repeatable where practical without recurring model charges.
The first permission-blocked live attempt is disclosed, and its separately
authorized retry supplies the successful scheduler evidence.
One Linux/OpenCode 2.4.1 live scenario is not universal platform certification;
the resume-policy harness is not presented as a real scheduler test.

## References

- [Automated gate tests](../../tests/gate.test.ts)
- [Checker tests](../../tests/checker.test.ts)
- [Results, failed attempt, and limitations](../verification.md)

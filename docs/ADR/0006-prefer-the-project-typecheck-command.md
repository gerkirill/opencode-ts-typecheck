# ADR 0006: Prefer the project typecheck command

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Projects may use framework-specific checkers, multiple compiler projects, or
other conventions. Replacing their check with a generic compiler invocation
could validate the wrong thing.

## Decision

If the session directory's `package.json` defines a nonempty string
`scripts.typecheck`, invoke that exact script through its package manager.
Select npm, pnpm, yarn, or bun from a valid `packageManager` field, otherwise
an unambiguous recognized lockfile, otherwise npm. Preserve native script and
applicable lifecycle semantics.

If the script is absent, require `tsconfig.json` in that directory and run
`tsc --noEmit`. Prefer the nearest installed
`node_modules/typescript/bin/tsc`, searching ancestors; otherwise use `tsc` on PATH.
Reject an invalid defined typecheck script rather than silently falling back.

## Alternatives considered

- **Always run `tsc`:** ignores the project's intended checker.
- **Guess aliases such as `check` or `typecheck:tsc`:** may select unrelated work
  and contradicts the requested command contract.
- **Always use npm:** does not preserve the project's package-manager conventions.
- **Parse the script and launch inferred executables:** changes shell/lifecycle
  behavior and cannot reliably interpret arbitrary scripts.

## Consequences

Package scripts remain authoritative, including their possible side effects.
Missing configuration, invalid manager declarations, and ambiguous lockfiles
are unresolved configuration problems, not passing checks.
Manager selection does not itself guarantee the installed binary's version.

## References

- [Command selection](../../src/checker.ts)
- [Real command tests](../../tests/checker.test.ts)
- [Provisioning policy](0007-use-provisioned-tools-without-automatic-downloads.md)

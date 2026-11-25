# ADR 0007: Use provisioned tools without automatic downloads

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

A completion hook must not unexpectedly install a compiler or package manager.
Even invoking an apparently local pnpm/yarn executable can bootstrap tooling
when that executable is a Corepack shim.

## Decision

Use already installed executables. Never invoke `npx` or an install command to
obtain missing tools. Set `COREPACK_ENABLE_NETWORK=0`,
`COREPACK_ENABLE_AUTO_PIN=0`, and `COREPACK_DEFAULT_TO_LATEST=0` in checker
subprocesses while preserving the rest of the environment.

Invoke an installed TypeScript compiler file with `node`, not
`process.execPath`: inside the host, that property can identify the standalone
OpenCode binary rather than Node.

## Alternatives considered

- **Use `npx tsc`:** convenient provisioning, but permits unexpected downloads
  and compiler selection outside the project's installed toolchain.
- **Bundle a compiler:** gives predictable availability but changes dependency
  ownership and can disagree with the project's TypeScript version.
- **Allow Corepack bootstrap:** respects manager metadata but can download tools
  as a hidden side effect of validation.
- **Use the host executable as Node:** works in some development environments,
  but not for a standalone OpenCode binary.

## Consequences

Users must provision their toolchain. A missing manager, compiler, or Node runtime
can stop validation as unresolved. These controls prevent implicit Corepack
bootstrap; they do not sandbox or block networking within trusted project scripts.

## References

- [Compiler invocation and child environment](../../src/checker.ts)
- [Tool and environment tests](../../tests/checker.test.ts)

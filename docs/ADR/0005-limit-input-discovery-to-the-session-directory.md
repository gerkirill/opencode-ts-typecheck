# ADR 0005: Limit input discovery to the session directory

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Typecheck inputs extend beyond `.ts` files, but a complete compiler dependency
graph or monorepo scheduler would substantially expand the first release.
Sessions and child sessions may operate in different locations.

## Decision

Resolve the current session's directory from the SDK, not `process.cwd()` or
only the plugin setup location. Scan that directory recursively for the source
extension families accepted by `changes.ts`, JSON/JSONC files, and known lockfiles.
This includes TS/TSX, JS-family files, declarations, manifests, and common configs.

Skip symlink entries, dependency trees, VCS metadata, `.slim`, and `.artifacts`.
Do not blanket-exclude `dist`: declarations there can be real compiler inputs.
Gate child sessions independently. Defer while the idle session owns background
work; do not assume descendant-owned work will wake its parent.

## Alternatives considered

- **Use only `.ts` and `.tsx`:** misses configuration, package-resolution, and
  declaration changes.
- **Follow TypeScript's complete input/reference graph:** more precise, but
  substantially more compiler/configuration integration.
- **Scan the repository root or follow symlinks:** can include unrelated packages,
  external trees, cycles, and much larger inputs.
- **Wait for every descendant job:** does not match the host's wake ownership model.

## Consequences

Coverage is conservative, not exhaustive: external configs, referenced packages,
symlinked inputs, and some custom script inputs are outside the guarantee.
Changing the session directory after baseline capture produces an unresolved
gate rather than silently applying the old baseline to another directory.

## References

- [Input filter](../../src/changes.ts)
- [Session location adapter](../../src/index.ts)
- [Background and directory handling](../../src/gate.ts)

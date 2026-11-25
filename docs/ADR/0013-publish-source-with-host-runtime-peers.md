# ADR 0013: Publish source with host runtime peers

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

OpenCode supports TypeScript plugin entrypoints and provides runtime SDK/Effect
instances. Bundling another runtime or publishing development fixtures would
add avoidable compatibility and release risks.

## Decision

Export `src/index.ts` directly as an ESM package, without a build/bundle step.
Declare the plugin SDK and Effect as peer dependencies, with matching pinned
development versions for the verified host: SDK 2.4.1 and Effect 4.1.0.
Use a package-file allowlist containing source and README; npm also includes
package metadata. Keep tests, playground, process state, and local evidence out.

Verify the packed artifact, not only the linked development directory.
Publishing remains an explicit user action, separate from setup and testing.

## Alternatives considered

- **Compile to JavaScript:** useful for more general consumers, but introduces
  build/export consistency work not needed by this host.
- **Bundle all dependencies:** simpler standalone delivery at the risk of
  duplicating host-sensitive runtime instances.
- **Follow unrestricted latest SDK versions:** risks adopting experimental API
  changes before the installed host is tested.
- **Publish the whole repository:** unnecessarily ships fixtures and local state.

## Consequences

Consumers need a compatible OpenCode loader; this is not a generic plain-Node
package entrypoint. Peer ranges are compatibility declarations, not evidence that
every matching host patch was exercised. Host SDK audit findings remain visible;
they are not silently addressed with an unverified upgrade.
Repository ADRs and verification records are intentionally not in the tarball.

## References

- [Exports, peers, and allowlist](../../package.json)
- [Packaging verification](../verification.md)
- [Development isolation](0001-standalone-package-and-isolated-playground.md)

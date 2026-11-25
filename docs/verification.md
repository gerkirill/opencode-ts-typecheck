# Verification

Target: OpenCode 2.4.1 on Linux, Node 24.13.1, npm 11.8.0,
`@opencode/plugin` 2.4.1, Effect 4.1.0, TypeScript 7.0.2.

## Automated evidence

- Repository typecheck and 30 automated tests passed with
  `npm run check` (exit 0). SDK integration typechecking caught the unavailable
  `Agent.ID.makeUnsafe`; the implementation uses the published `make` method.
- Checker tests launch real npm scripts and TypeScript against passing/failing
  TSX. They cover missing tools/config, nonzero exits, output caps, process-group
  timeout/abort, and descendant cleanup.
- Gate tests use real Effect fibers, interruption, and semaphores with an
  injectable IO boundary. They do not pretend to be OpenCode scheduler tests.
- A review found stale command selection during permission/lock waiting.
  Three regression tests verify reselect/reapprove before execution and
  bounded approval-time invalidation (focused command exit 0); the final broad
  check includes them.
- A real subprocess test verifies Corepack download/auto-pin/latest lookup are
  disabled without discarding the rest of the environment.
- `npm run typecheck` in `playground` passed (exit 0).

## Host activation

The installed host's `/api/plugin` response for the disposable fixture's
`location[directory]` reported local plugin `typecheck` as **active**.
This establishes activation, not a completed model repair loop.

## Packaging

An initial `npm pack` archive contained exactly package metadata, README, and
the four source modules. A disposable install with matching host peers imported
the exported plugin successfully. Repack after final source changes.

## Security and limits

`npm audit` reported 24 moderate transitive findings through the pinned SDK
development graph; `npm audit --omit=dev` reported zero. Host peers remain the
host's responsibility. No untested SDK upgrade or automatic audit fix was used.

Linux process groups are tested; Windows process-tree cleanup is not certified.
Source filtering is conservative and local-directory-only, not a complete
TypeScript dependency graph. External edits may trigger checks.

## Remaining runtime evidence

One user-approved, time-bounded live repair session and final packaged import
are pending. No npm publish or remote repository creation is authorized.

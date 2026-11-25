# Verification

Target: OpenCode 2.4.1 on Linux, Node 24.13.1, npm 11.8.0,
`@opencode/plugin` 2.4.1, Effect 4.1.0, TypeScript 7.0.2.
Date: 2026-11-25.

Independent review approved the implementation after the two bounded
corrections below, then approved the runtime/packaging evidence. No remaining
review blockers were identified at this fidelity.

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

The activation and live-repair evidence below predates the rename to
`opencode-ts-typecheck`; it records the original internal ID `typecheck`.
No new paid live run was performed for the rename.

The installed host's `/api/plugin` response for the disposable fixture's
`location[directory]` reported local plugin `typecheck` as **active**.
This establishes activation, not a completed model repair loop.

## Packaging

`npm pack --json --pack-destination .artifacts` (exit 0) produced exactly
`package.json`, `README.md`, and the four source modules. No playground, tests,
process state, dependencies, or live transcript is included.

A disposable `npm install --ignore-scripts --no-audit --no-fund` of that tarball
with matching host peers passed (exit 0). A `node --import tsx` import smoke
asserted the plugin ID and Effect entrypoint, the six-file archive allowlist,
and byte-for-byte equality of all four installed modules to the tested source
(exit 0). This is an export/package smoke test, not another model run.

## Live repair on OpenCode 2.4.1

The first time-bounded attempt could not edit the fixture because its edit rule
used an absolute path while internal edit resources are session-relative. It
changed no files and did not exercise the checker. The user explicitly
authorized one retry; the disposable rule was narrowed to `src/index.tsx`.
No global permissions were changed.

The retry used a private host, agent step limit 6, a 180-second outer timeout,
and `openai/gpt-6.1-sol#medium`. CLI exit was 0; stderr was empty.

Session: `ses_dec9f6405ffe43Aq3N6eZmzFLQ`

Persisted context, inspected through `/api/session/<id>/context`, established:

1. Exactly one user input requested the deliberate temporary error.
2. The agent wrote `export const message: string = 42`, then attempted completion.
3. The plugin admitted exactly one synthetic remediation message containing
   `src/index.tsx(1,14): error TS2322: Type 'number' is not assignable to type 'string'.`
4. The same session continued, changed the value to `"42"`, and completed.
5. The only persisted idle message followed that repair; no intermediate idle
   or additional user input appeared. The session outcome was `succeeded`.

The adapter used explicit `resume: false`. This establishes same-execution
continuation for the selected implementation, not merely eventual wakeup.
After completion, `npm run typecheck` in the fixture independently passed
(exit 0). The final repaired assignment retained its `string` annotation.

Raw disposable logs/context and the tarball are under ignored `.artifacts/`.
No paid model request is part of the automated suite.

## Rename and npm release preparation

The package and internal plugin ID are now `opencode-ts-typecheck`, version `0.1.0`.
Instruction-entry keys use the same ID. Root and playground lockfiles match
their renamed packages. MIT licensing was explicitly selected for this release.

- `FORCE_COLOR=1 npm publish --dry-run --json` passed, including the
  `prepublishOnly` typecheck and all 30 tests.
- The playground typecheck passed.
- `npm pack --json --pack-destination .artifacts` produced
  `opencode-ts-typecheck-0.1.0.tgz` with exactly seven files: package metadata,
  README, LICENSE, and the four source modules.
- Installing that archive into a disposable project with matching host
  peers and importing it with `node --import tsx` passed. Assertions verified
  the package name, plugin ID, MIT metadata, Effect entrypoint, exact file
  allowlist, and byte-for-byte equality with the source and shipped documents.

The earlier six-file packaging evidence describes the pre-license artifact.
The dry-run does not establish real publishing authorization or reserve the
package name. No package was uploaded, and no public repository URL was invented.

## GitHub Actions publishing preparation

The release workflow was checked with `actionlint` 1.7.12 (exit 0).
Its actual validation, check, packing, and dry-run shell steps were also
executed locally:

- Matching `v0.1.0` was accepted; mismatched `v9.9.9` was rejected.
- Manual-dispatch validation succeeded without a release tag.
- All 30 tests passed with forced color, and both typechecks passed.
- The seven-file archive assertion and tarball publication dry-run passed.

The upload step was not executed. Hosted Actions behavior, the repository
secret, real registry authorization, and provenance signing remain unverified
until an authorized release. No token was requested through chat or written
to source.

## Security and limits

`npm audit` reported 24 moderate transitive findings through the pinned SDK
development graph; `npm audit --omit=dev` reported zero. Host peers remain the
host's responsibility. No untested SDK upgrade or automatic audit fix was used.

Linux process groups are tested; Windows process-tree cleanup is not certified.
Source filtering is conservative and local-directory-only, not a complete
TypeScript dependency graph. External edits may trigger checks. Per-session
state and directory semaphores remain in memory until plugin unload; retry
accounting does not survive reload/restart.

No npm publish or remote repository creation was performed.

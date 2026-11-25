# opencode-typecheck

A completion gate for **OpenCode 2.4.1**. When relevant project files change
during a session, run a typecheck before completion. Give failing diagnostics
back to the agent so it can fix them and check again.

This uses the **experimental** `experimental.idle` server hook, not an idle
event listener. Host upgrades may require a compatible plugin update.

## Develop and exercise separately

```sh
npm ci
npm --prefix playground ci
npm run check
```

Develop the plugin from this repository:

```sh
opencode .
```

Exercise it in a separate session:

```sh
cd playground
opencode .
```

Only `playground/opencode.json` activates the plugin, using `"plugins": [".."]`.
Paths resolve relative to the config file. The plugin's root config does not
activate it, so an unfinished checker does not interfere with its development.
The playground has its own TypeScript dependency and configuration.

OpenCode watches configuration directories, but source in an explicitly linked
directory is not necessarily watched. Use `/reload` in the exercise session
after plugin edits; verify new behavior instead of assuming hot reload.
For a fresh isolated host, launch the exercise session with
`opencode --standalone .` rather than restarting a shared service.

## Use in a project

For local development, add a directory path to that project's `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-typecheck"]
}
```

The package exports TypeScript source directly, as supported by OpenCode.
No build or global installation is needed.

Optional bounds use the object form of the plugin entry:

```json
{
  "plugins": [{
    "package": "/absolute/path/to/opencode-typecheck",
    "options": {
      "maxAttempts": 3,
      "timeoutMs": 60000,
      "maxOutputBytes": 16384
    }
  }]
}
```

All values are positive integers. Limits are respectively 10 attempts,
300,000 milliseconds, and 65,536 output bytes. Invalid options fail activation.

### Which command runs?

1. If the session directory's `package.json` defines `scripts.typecheck`, use
   the project's package manager to run that exact script.
2. Otherwise, run locally available `tsc --noEmit`.

The plugin never uses `npx` to download a compiler or installs missing tools.
Install TypeScript in the target project yourself. A missing compiler or broken
configuration is an **unresolved check**, not a passing check.
Corepack network/bootstrap behavior is disabled for checker subprocesses;
provision the selected package manager yourself. This is not a network sandbox
for arbitrary commands inside a trusted project script.

Package-manager selection uses `packageManager`, then an unambiguous lockfile,
then npm. Project scripts retain their normal package-manager semantics,
including applicable pre/post scripts. These are arbitrary project code:
OpenCode execution permissions apply to both script and compiler execution.

### Why `resume: false`?

The hook runs **before** the current execution ends. A synthetic message is
durably admitted regardless of `resume`. After the hook, the runner checks its
inbox and processes the admitted diagnostics in that same execution.

`resume: true` (the default) additionally requests a wake. It is useful when
admitting input into an **already idle** session, but unnecessary inside this
awaited hook. Both values can reach the hook again after the next model work.
Neither flag prevents loops.

The gate therefore maintains a separate repair budget: by default, at most
three repair requests per failure episode. A genuine new user request or a
verified passing check resets the budget; synthetic diagnostics and changed
files do not. Exhaustion is reported as **unresolved** and allows completion
with errors. The plugin cannot guarantee that a model can repair every project.
One terminal diagnostic message can ask the agent to give an honest final
report; it is not another repair request, and the terminal latch prevents
further gate continuations.

## What is checked?

The initial relevant-input snapshot is captured before the first model call.
Subsequent completion attempts compare content and paths, not merely Git dirty
status or edit-tool calls. This catches shell-based edits, additions, and
deletions while ignoring edits that existed before the session's work.

Coverage is deliberately conservative: TypeScript/TSX and JS-family source,
declarations, JSON/configuration inputs, manifests, and lockfiles inside the
session directory. Dependency trees and VCS/process metadata are excluded.
Files in `dist` are not automatically excluded: declarations there can be inputs.
Snapshots before and after a checker run prevent accepting a passing result
against files that changed during that run.

Checks for one directory are serialized. Checks defer while the session owns
active background work. Child sessions have their own state; descendant-owned
background work is not assumed to wake the parent.

## Limits

- No complete TypeScript dependency graph, monorepo orchestration, or tracking
  of inputs outside the session directory.
- Concurrent user/other-session edits can trigger checks; snapshots do not
  establish which actor wrote a file.
- Retry accounting is in memory; a host reload/restart resets it.
- Timeouts, permission denial, missing tools, and exhausted retries are not
  success. Stop/cancellation must not be used as evidence of passing.
- A command may have side effects before cancellation. Killing its process
  cannot roll back those effects or retract already-admitted diagnostics.
- This is completion-time feedback, not V1's full per-edit LSP diagnostics UI.

## Package and publish

```sh
npm run check
npm pack --dry-run
npm pack
```

The package allowlist includes source and documentation, not the playground,
tests, local evidence, or Deepwork state. Test the generated tarball in a
disposable project before release. When ready, publish explicitly with
`npm publish`; repository setup and tests do not publish anything.

Host libraries are peer dependencies. Development uses the matching
`@opencode/plugin@2.4.1` and `effect@4.1.0`; do not bundle a second Effect
runtime into a plugin. `npm audit` currently reports moderate transitive
findings through the pinned host SDK development dependency graph. They are
not fixed by silently upgrading the SDK beyond the tested host version.

See [verification evidence](docs/verification.md) in the repository for the
tested host, automated coverage, packaging checks, and the live repair result.
Design choices, alternatives, and trade-offs are recorded in the
[architecture decision records](docs/ADR/README.md).

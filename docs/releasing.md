# Releasing

## Verify and package

From the repository root:

```sh
npm ci
npm --prefix playground ci
npm run check
npm --prefix playground run typecheck
mkdir -p .artifacts
npm pack --dry-run
npm pack --pack-destination .artifacts
```

The archive must contain only `package.json`, `README.md`, `LICENSE`, and the
four source modules—not the playground, tests, local evidence, or process state.
Test the generated tarball in a disposable project before release.
See [verification evidence](verification.md) for prior packaging checks.

## GitHub Actions publishing

The [publish workflow](../.github/workflows/publish.yml) publishes on a
**published, non-prerelease GitHub Release**. Pushing a commit or tag alone does
not publish. Manual Actions runs perform verification and a dry-run only.

### Configure authentication

Add an npm publishing token as the `NPM_TOKEN` repository secret:

```sh
gh secret set NPM_TOKEN --repo gerkirill/opencode-ts-typecheck
```

Enter the token at the hidden prompt, never in source, chat, or a command argument.
Use a publishing token with bypass 2FA enabled, minimum required permissions,
and a valid expiration date. If the package does not exist yet, the token must
allow creating it, not just updating it.

The token is exposed only to the final publish step. An npm trusted publisher
(OIDC) can replace it later; currently, OIDC only signs provenance.

### Publish a release

1. Update the version in `package.json` and the matching lockfile, then commit
   and push the change. Never reuse a published npm version.
2. Create a GitHub Release at that commit with a tag matching `v` plus the
   package version, for example `v0.1.0`. The workflow must exist at that commit.
3. Publish the release as a stable release, not a prerelease.

The workflow validates the release identity, runs tests with color enabled,
typechecks the playground, checks the archive's allowlist, and dry-runs
publication before uploading the same tarball with npm provenance.
The final publish step skips lifecycle scripts because source checks ran
before packing.

See [ADR 0015](ADR/0015-publish-from-github-releases.md) for the design rationale.

## Manual publishing

After verification, authenticate with `npm login`, inspect the release with
`npm publish --dry-run`, then run `npm publish` when ready.
Both publish commands run `prepublishOnly`, requiring the repository typecheck
and tests to pass. `publishConfig` sets the registry and public access.
Publishing a prebuilt tarball does not replace the source checks above.

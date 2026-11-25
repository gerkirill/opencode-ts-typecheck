# ADR 0015: Publish from GitHub Releases

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The public repository needs repeatable npm releases. The maintainer has an npm
publishing token with bypass 2FA enabled. Routine pushes must not publish.

## Decision

Publish stable releases through GitHub Actions when a non-prerelease GitHub
Release is published. Require its tag to match the package version exactly.
Manual workflow runs verify without uploading. Pin external actions to commits,
disable persisted checkout credentials, and serialize publishing runs without
cancelling an active publication.

Check source and playground, inspect the package allowlist, and dry-run before
publishing the same tarball. Authenticate only the upload step with the
`NPM_TOKEN` repository secret. Skip lifecycle scripts during tarball publication:
the source checks have already run. Request OIDC permission for provenance.

## Alternatives considered

- **Publish on every push or tag:** makes accidental releases easier.
- **Only publish manually from a workstation:** lacks repeatable hosted checks.
- **npm trusted publishing:** avoids a long-lived token and is a good future
  improvement; the initial workflow uses the maintainer's available token.

## Consequences

The maintainer must configure and rotate the secret and publish matching release
tags. Stable releases use npm's default `latest` tag; prereleases are not supported.
Dry-runs cannot prove real token authorization or provenance signing.
Publishing is irreversible for a given npm version; failed post-upload runs must
be investigated rather than blindly rerun. The workflow must exist at the release
commit.

## References

- [Publish workflow](../../.github/workflows/publish.yml)
- [Release instructions](../releasing.md#github-actions-publishing)

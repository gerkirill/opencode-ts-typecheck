# ADR 0001: Standalone package and isolated playground

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The plugin must be developed and published independently while being exercised
against a small TypeScript project. Loading unfinished behavior into the session
developing that behavior could disrupt development itself.

## Decision

Keep one publishable package at the repository root and an independent package
under `playground/`. Only the playground activates the plugin, through
`"plugins": [".."]`. Give the playground its own compiler dependency, lockfile,
and TypeScript configuration. Use npm for this repository's development.

Develop from the root and exercise from a separate playground session.
A standalone OpenCode host is available when fresh, isolated loading is needed.

## Alternatives considered

- **A project-local `.opencode/plugins/` implementation:** easy discovery, but
  couples the distributable plugin to the application used to exercise it.
- **Global installation during development:** exercises a realistic loading path,
  but exposes unrelated sessions to unfinished behavior.
- **Separate repositories or a workspace monorepo:** useful at larger scale, but
  unnecessary coordination and package-management setup for two small packages.

## Consequences

Development and exercise remain colocated without sharing activation or compiler
configuration. Dependencies are installed separately. Source reload behavior
must be verified; linking a directory does not guarantee hot reload.

## References

- [Repository workflow](../../README.md)
- [Playground activation](../../playground/opencode.json)
- [Playground package](../../playground/package.json)

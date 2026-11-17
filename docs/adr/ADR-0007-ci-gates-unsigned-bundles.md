# ADR-0007: CI gates every PR; desktop bundles are unsigned until v0.1

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Main must stay buildable, and the app must eventually ship for macOS and
Windows. Signing requires secrets and identities that do not exist yet.

## Decision

- `ci.yml` runs on every PR and on main: typecheck → lint → unit tests →
  frontend build, plus a Playwright e2e job. Branch protection on `main`
  must require the `quality` and `e2e` checks (repo setting, done once when
  the GitHub remote exists).
- `desktop-build.yml` builds **unsigned** bundles (macOS universal +
  Windows NSIS/MSI) on push to main and via manual dispatch, uploading them
  as artifacts. No release publication yet.
- Signing + notarization is a prerequisite for the first public release
  (blueprint v1.1) and will add `APPLE_CERTIFICATE*` secrets on macOS and
  Trusted Signing on Windows.

## Consequences

- Windows verification (the platform this repo's lead cannot test locally)
  happens in CI from day one of packaging.
- Unsigned macOS builds require right-click → Open; unsigned Windows
  binaries trigger SmartScreen warnings — acceptable for development
  artifacts, not for end-user distribution.

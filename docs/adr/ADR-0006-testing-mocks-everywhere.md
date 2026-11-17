# ADR-0006: Testing strategy — mocks everywhere, real database only in Rust

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

CI must be fast, deterministic, and never contain real API keys, while still
covering the persistence and teaching paths meaningfully.

## Decision

- **Unit tests (Vitest)** run against: a scripted MockProvider for model
  calls, an in-memory transport fake that implements the SQL subset the
  repositories use (with SQLite NULL-column semantics), and deterministic
  mock skills. Content files are validated against the Zod schema as tests.
- **E2E (Playwright)** runs against the Vite dev server in a plain browser;
  the Tauri IPC bridge is mocked via an `addInitScript` shim installing
  `window.__TAURI_INTERNALS__`. Covers navigation, degradation, and the
  persistence contract across reloads.
- **Rust tests** cover the real SQLite path: migrations, backup/restore.
- CI artifacts: JUnit XML for unit tests, HTML report + failure traces for
  e2e — results are traceable on every run.

## Consequences

- The in-memory transport fake must stay in sync with `schema.ts` column
  lists (enforced by the repository tests).
- Playwright `addInitScript` payloads are serialized: the mock must not close
  over module-scope values (this broke once and was caught by e2e).
- Real end-to-end SQLite + IPC verification happens in manual dev smoke runs
  (`tauri dev`) and will be automated when packaging CI lands.

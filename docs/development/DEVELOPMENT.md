# Development Guide

Status: current for v0.0.1 (Tasks 01–09).

## Prerequisites

- Node >= 20 (22 recommended)
- pnpm (the repo pins `packageManager: pnpm@12.21.0`; corepack or a matching install)
- Rust stable — only needed for the desktop shell and packaging

## Daily commands

```bash
pnpm install                                  # workspace dependencies
pnpm typecheck                                # TypeScript across the monorepo
pnpm lint                                     # ESLint
pnpm format                                   # Prettier
pnpm test                                     # unit tests (Vitest)
pnpm test:e2e                                 # Playwright e2e (starts Vite on 1420)
pnpm --filter @language-lab/desktop dev       # frontend only (Vite, port 1420)
pnpm --filter @language-lab/desktop tauri dev # full desktop shell (needs Rust)
```

`pnpm test:e2e` and Playwright's `webServer` start the Vite dev server
automatically; the Tauri IPC bridge is mocked in-browser (see
`tests/e2e/helpers/tauri-mock.ts`), so no Rust binary or API key is needed.

## Layout quick map

- `apps/desktop/src/pages/` — one component per page (Dashboard, Scenarios,
  Training, Reports, Settings); state in `src/stores/` (Zustand), IPC in
  `src/lib/ipc.ts`.
- `packages/core` — lesson state machine + scenario content schema.
- `packages/database` — Zod row schemas + repositories (the only TS-side SQL).
- `packages/model-gateway` — provider interfaces; MockProvider for offline dev.
- `packages/skills` — skill contract, registry, 7 first-batch skills.
- `content/scenarios/*.json` — product content, Zod-validated in tests.

For versioned teaching courses, the template format, Scenarios configuration and
runtime integration, see [Scenario courses](SCENARIO_COURSES.md).
For text practice, evidence-based stage progression, connected AI and local
checkpoint persistence, see [Teaching loop](TEACHING_LOOP.md).

## Data locations (macOS dev)

- Database: `~/Library/Application Support/com.languagelab.desktop/language-lab.db`
- Migrations applied transactionally by the Rust core; automatic backup kept
  (last 3) before version-changing migrations.

## Before declaring any change done

1. `pnpm typecheck && pnpm lint && pnpm test`
2. `pnpm test:e2e` when the change touches UI or IPC
3. `pnpm format` (Prettier)
4. `pnpm --filter @language-lab/desktop tauri dev` smoke run when the change
   touches the Rust core or IPC commands
5. Update the relevant ADR in `docs/adr/` if a documented decision changed.

## CI

- `ci.yml`: every PR — typecheck, lint, unit tests (JUnit artifact), frontend
  build, Playwright e2e (HTML report artifact).
- `desktop-build.yml`: push to main / manual — unsigned macOS universal and
  Windows NSIS/MSI bundles as artifacts. Signing is a v0.1 release
  prerequisite (see ADR-0007).

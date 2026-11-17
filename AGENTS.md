# AGENTS.md

Guidance for AI coding assistants operating on this repository (Codex, Claude
Code, and similar agents).

## What this project is

Language Lab: a local-first AI language learning desktop app. Tauri 2 shell,
React + TypeScript frontend, Rust core, SQLite storage, pluggable LLM/ASR/TTS
providers. Distributed via GitHub Releases; installable by AI assistants
following `docs/installation/AI_INSTALL.md` (LLAIP protocol).

## Non-negotiable constraints

1. **No Python, no Docker, no cloud backend.** Do not add runtime dependencies
   on any of them.
2. **The webview has no Node.js.** Never add dependencies that require Node
   native modules in frontend code (e.g. better-sqlite3). SQLite access goes
   through the Rust core over Tauri IPC.
3. **Never place provider API keys in webview storage** (localStorage, IndexedDB,
   plain files). Keys belong in the OS keyring via Rust commands.
4. **User data is sacred.** `content/` is product content shipped with the app;
   the SQLite database is user data. Database migrations must run inside a
   transaction, back up the database file first, and roll back on failure.
   Never write user data into the repository.
5. **No unreviewed executable install scripts for end users.** End-user
   installation uses prebuilt, signed installers from GitHub Releases.
6. **Skills validate at the boundary.** Every skill declares zod input/output
   schemas; LLM outputs are validated before use.

## Workspace map

| Path                     | Package                       | Depends on                          |
| ------------------------ | ----------------------------- | ----------------------------------- |
| `apps/desktop`           | `@language-lab/desktop`       | all packages                        |
| `packages/core`          | `@language-lab/core`          | shared                              |
| `packages/agent-runtime` | `@language-lab/agent-runtime` | core, shared                        |
| `packages/skills`        | `@language-lab/skills`        | core, model-gateway, memory, shared |
| `packages/memory`        | `@language-lab/memory`        | database, shared                    |
| `packages/model-gateway` | `@language-lab/model-gateway` | shared                              |
| `packages/database`      | `@language-lab/database`      | shared                              |
| `packages/shared`        | `@language-lab/shared`        | (none)                              |

Keep dependency edges exactly as listed. No cycles.

## Commands

```bash
pnpm install          # install workspace dependencies
pnpm typecheck        # TypeScript check (root tsconfig.json)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm test             # unit tests (Vitest, root config)
pnpm test:e2e         # Playwright e2e (starts Vite on port 1420)
pnpm --filter @language-lab/desktop dev         # frontend dev server (Vite, port 1420)
pnpm --filter @language-lab/desktop tauri dev   # full desktop shell (needs Rust)
```

## Frontend conventions (apps/desktop)

- Pages live in `src/pages/`, app state in Zustand stores under `src/stores/`
  (no router dependency; sidebar navigation drives the active page).
- All Tauri IPC goes through `src/lib/ipc.ts` (normalized `IpcError`).
- Styling is Tailwind CSS v4 (`@tailwindcss/vite`); fixed light theme for v0.1.
- Every page renders three states: loading / error (with retry) / data.
- Scenario content ships as `content/scenarios/*.json`, bundled through
  `src/content/scenarioContent.ts` and upserted at startup by
  `src/content/syncScenarios.ts` (slug upsert, user data untouched).

## Working rules

- Keep `packages/*` framework-free (no React imports outside `apps/desktop`).
- Do not create abstraction layers before there is a second concrete
  implementation. No speculative interfaces.
- Do not implement business features ahead of the current task; extend types
  only when the task requires them.
- Run `pnpm typecheck && pnpm lint` before declaring any code change done.
- Update `docs/architecture/*.md` when changing a documented decision.

## Status

Implemented (v0.0.1): monorepo, Tauri 2 shell, SQLite data layer (11 tables,
Rust-side migrations + backups), Model Gateway with MockProvider, Teaching
Agent Runtime with 7 skills, UI foundation (Tailwind v4 + Zustand, 5 pages),
scenario content system foundation, 80 unit tests + 8 e2e specs, GitHub
Actions CI with PR gating and unsigned desktop-build artifacts.

Architecture decisions are recorded in `docs/adr/` — read them before changing
any documented behavior. The authoritative architecture document is the
Language Lab Engineering Blueprint v1.1. Current backlog: voice pipeline spike
(WKWebView MediaRecorder), provider proxy in Rust, signed packaging.

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
pnpm dev              # frontend dev server (Vite, port 1420)
pnpm --filter @language-lab/desktop tauri dev   # full desktop shell (needs Rust)
```

## Working rules

- Keep `packages/*` framework-free (no React imports outside `apps/desktop`).
- Do not create abstraction layers before there is a second concrete
  implementation. No speculative interfaces.
- Do not implement business features ahead of the current task; extend types
  only when the task requires them.
- Run `pnpm typecheck && pnpm lint` before declaring any code change done.
- Update `docs/architecture/*.md` when changing a documented decision.

## Status

The repository is a skeleton (v0.0.1). The authoritative architecture document
is the Language Lab Engineering Blueprint v1.1; see `docs/architecture/` as it
fills in. Current backlog: blueprint appendix B technical spikes.

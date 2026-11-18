# AGENTS.md

Guidance for AI coding assistants operating on this repository (Codex, Claude
Code, and similar agents).

## What this project is

Language Lab: a local-first AI language learning desktop app. Tauri 2 shell,
React + TypeScript frontend, Rust core, SQLite storage, pluggable LLM/ASR/TTS
providers. Distributed via GitHub Releases; installable by AI assistants
following `docs/installation/AI_INSTALL.md` (LLAIP protocol).

## Required task workflow

1. **Read before editing.** Read [README.md](README.md), this file,
   [System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md), the relevant
   [ADRs](docs/adr/) and development guides. Check for more specific `AGENTS.md`
   instructions in the directories being changed before modifying code.
2. **One clear task at a time.** State the intended outcome and verification
   scope. Keep each branch/PR focused on that task; do not bundle unrelated
   features, refactors or cleanup.
3. **Preserve established architecture.** Follow the stack, process boundaries,
   workspace dependency graph and agent/skill responsibilities below. Do not
   replace them as an incidental implementation choice. Record any architecture
   change within an explicitly requested task in an ADR before dependent code.
4. **Explain new dependencies.** For every new runtime or development dependency,
   document why it is needed, why existing facilities are insufficient, its
   workspace/runtime impact and any platform constraints. Keep manifests and the
   lockfile consistent; an explanation is required, not a separate approval step.
5. **Keep API keys out of code and Git.** Never put real credentials in source,
   fixtures, commits, logs or webview storage. Use the OS keyring for application
   keys and CI secret storage for build credentials. Tests use clearly synthetic
   values, never real provider keys.
6. **Do not directly modify learner data.** Do not patch, seed, reset or overwrite
   a user's live learning database/files as a development shortcut. Use isolated
   synthetic fixtures and temporary databases. Product writes go through the
   validated repository/IPC flow; migrations use the documented backup and
   transaction path. Never mix learner records into `content/` or Git.
7. **Ship migrations with database schema changes.** Include a new versioned SQL
   migration and corresponding schema/journal updates. Preserve applied
   migrations, back up before migrating, run transactionally and test rollback
   and existing-data compatibility. Stored JSON format changes must document
   versioning and backward compatibility even when no SQL schema changes.
8. **Test agents and skills.** New or changed agent/skill behavior needs meaningful
   deterministic tests, including relevant success, invalid-output and failure
   paths. Use mock providers/injected transports and isolated data; do not call
   real models or use learner data in automated tests.
9. **Validate all model outputs.** Apply declared schemas before model output
   reaches teaching state, persistence or UI. Structured skill inputs and outputs
   use Zod at the boundary; parsing JSON or a TypeScript assertion is not
   validation. Text/audio results must also satisfy their declared content/type
   and size contracts. Validate evidence references separately where applicable.
10. **Verify every task before completion.** Run `pnpm typecheck`, `pnpm lint` and
    relevant tests. The default unit gate is `pnpm test`; also run e2e for UI/IPC
    changes and native checks for native changes. Check formatting and the diff.
    Report exact commands/results and any unavailable checks; never describe
    mocked/browser checks as real-provider or native-device verification.
11. **Preserve test coverage.** Do not delete, disable, weaken assertions or hide
    failures merely to make checks pass. Test updates must reflect intended
    behavior and retain relevant coverage; explain replacements or changed
    expectations. Do not blindly accept snapshot changes to conceal regressions.
12. **Update related documentation.** Keep usage/configuration, development and
    architecture docs consistent with the change. Update/add an ADR when a
    documented decision changes. Finish with the outcome, validation, remaining
    limitations and Git status (branch/base, commit, pushed/merged state).

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
- Apply the required task workflow above, including its validation and
  documentation requirements, to every task.

## Git workflow

Use `main` as the stable integration branch. The recommended branch layout is:

```text
main
  +---- feat/desktop-shell
  +---- feat/database
  +---- feat/model-gateway
  +---- feat/agent-runtime
  +---- feat/teaching-skills
  +---- release/v0.1.0
```

- These names illustrate the strategy; do not create placeholder branches or
  rename historical branches just to match the diagram. For new work, use a
  specific `feat/<task>`, `fix/<task>` or `chore/<task>` branch for one clear task.
- Start independent tasks from the latest fetched `origin/main`. If a task
  depends on unmerged work, make the base branch and merge order explicit in the
  PR and completion report. Do not silently carry unrelated pending work.
- Review and merge through a PR to `main` after the required CI checks pass.
  Repository branch protection must require `quality` and `e2e` as described in
  [ADR-0007](docs/adr/ADR-0007-ci-gates-unsigned-bundles.md); documentation alone
  does not enable GitHub protection.
- Keep shared history intact. Do not force-push shared branches, merge PRs or
  publish releases as incidental task cleanup. Verify remote state before
  claiming a push or merge succeeded.
- Use `release/v0.1.0` for release stabilization and validation of selected work.
  A release branch is not a public release; signing, packaging and publication
  follow ADR-0007 and the task's authorized scope.

See the [Development Guide](docs/development/DEVELOPMENT.md) for the task checklist.

## Current context

Architecture decisions are recorded in `docs/adr/` — read them before changing
documented behavior. Use the current branch, README, development guides and ADRs
to establish implemented capabilities and remaining work. Do not infer shipped
features from unmerged branches or copy historical test counts as current status.

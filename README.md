# Sayden · 言港

_Practice here. Speak out there._

真实对话，先练一遍。

Sayden is a local-first AI language learning desktop app built with Tauri 2,
React and TypeScript. It combines a teaching agent with
skills and a lesson state machine, student data stored locally in SQLite, and an
installation protocol that lets AI coding assistants (Codex, Claude Code, ...)
install the app from this repository.

## Stack

| Layer         | Choice                                                        |
| ------------- | ------------------------------------------------------------- |
| Desktop shell | Tauri 2                                                       |
| Frontend      | React 19 + Vite + TypeScript + Tailwind CSS v4 + Zustand      |
| System layer  | Rust (SQLite via rusqlite, keyring, AI proxy)                 |
| Data access   | Rust-side SQLite; Drizzle as build-time schema/migration tool |
| Validation    | Zod                                                           |
| Testing       | Vitest + Playwright                                           |
| CI/CD         | GitHub Actions (macOS + Windows)                              |

No Python. No Docker. No cloud backend. Learning records are stored locally;
using a connected provider sends the selected request data to that endpoint.

## Repository layout

```
apps/
  desktop/            Tauri 2 shell + React frontend
packages/
  core/               Lesson, conversation, events, teaching state machine
  agent-runtime/      Teaching agent orchestrator
  skills/             Skill contract and skill implementations
  memory/             Profile / knowledge / error / episodic memory
  model-gateway/      LLM / ASR / TTS provider interfaces
  database/           Persistence boundary (Rust-side SQLite over IPC)
  shared/             Cross-package types, ids, result types
content/              Teaching assets: scenarios, vocabulary, expressions, evaluation
docs/                 Product, architecture, installation, ADRs, development docs
scripts/              Maintenance scripts (doctor, verify-release, validate-content)
tests/                unit / integration / e2e / evals
```

Architecture rules that matter:

- **The webview has no Node.js.** Anything depending on Node native modules
  cannot ship. SQLite runs in the Rust process, reached over IPC.
- **Provider API keys live in the OS keyring**, resolved at call time and never
  persisted in webview storage. The planned Rust proxy and current gateway
  direct-fetch fallback are documented in [ADR-0002](docs/adr/ADR-0002-keys-in-keyring-rust-proxy.md).
- **`content/` is product content; the SQLite database is user data.** The two
  are never mixed, and updates never overwrite user data.
- **Skills and the agent are separated.** The agent decides _when_ to call a
  skill; skills do the task with zod-validated inputs and outputs.

## Development governance

Read [AGENTS.md](AGENTS.md) before changing the project. It defines the required
12-rule task workflow: read the design first, implement one clear task, preserve
architecture, explain dependencies, protect credentials and learner data, ship
migrations, test agent/skill behavior, validate model outputs, run checks, preserve
test coverage and update documentation.

Keep `main` stable. Start independent work from the latest `origin/main`, use a
focused `feat/*`, `fix/*` or `chore/*` branch, and merge through a reviewed PR with
required checks passing. `release/v0.1.0` is for release stabilization. See
[Git workflow](AGENTS.md#git-workflow) and the
[Development Guide](docs/development/DEVELOPMENT.md#task-checklist).

## Getting started (development)

Requirements: Node >= 20, pnpm, Rust toolchain (stable) for the Tauri shell.

```bash
pnpm install
pnpm typecheck   # TypeScript check across the monorepo
pnpm lint        # ESLint
pnpm dev         # Vite dev server (frontend only)
```

To run the desktop shell (requires Rust):

```bash
pnpm --filter @language-lab/desktop tauri dev
```

## Testing

```bash
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # browser e2e (Playwright, mocks the Tauri IPC bridge)
pnpm typecheck    # TypeScript across the monorepo
pnpm lint         # ESLint
```

Automated tests use synthetic fixtures, mock providers and isolated database
transports. They never use real provider credentials or a learner's live database.
Browser e2e tests mock `window.__TAURI_INTERNALS__`; they do not replace native
platform verification. Follow the task checks in the Development Guide.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on
`main`: typecheck → lint → unit tests → frontend build, plus a Playwright e2e
job. Test results are uploaded as JUnit / HTML artifacts on every run.
`.github/workflows/desktop-build.yml` builds unsigned macOS/Windows artifacts on
push to `main` and manual dispatch. Signing remains required for public release
(see [ADR-0007](docs/adr/ADR-0007-ci-gates-unsigned-bundles.md)).

**Branch protection (required):** in GitHub repo settings, add a rule for
`main` requiring the `quality` and `e2e` checks to pass before merging. CI
failure then blocks merges.

## Docs

- `docs/product/PRD.md` — product requirements
- `docs/architecture/` — system, agent and memory architecture
- `docs/adr/` — architecture decision records (read before changing documented behavior)
- `docs/installation/AI_INSTALL.md` — LLAIP: the agent installation protocol
- `AGENTS.md` — how AI assistants should operate on this repository

## License

MIT

## Interface language

The desktop interface follows the OS language by default, with simplified Chinese,
traditional Chinese and English resources. Unsupported languages use English.
My learning → Settings → Language allows a persistent manual override or returning to Follow
system. This controls UI copy and regional formatting independently from course,
AI-dialogue and teaching-explanation language. See
[Task 03](docs/development/TASK_03_UI_FOUNDATION.md).

The app opens to the learning plan and course library. Conversation contains
roleplay, guided practice and listening. Review contains follow-up tasks and
lesson history. My learning contains the local profile, progress and settings.
See [desktop learning workspaces](docs/product/PRD.md#desktop-learning-workspaces).

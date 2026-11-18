# Development Guide

This guide describes the development workflow. The current branch and relevant
ADRs define which capabilities are implemented.

## Task checklist

[AGENTS.md](../../AGENTS.md) is the canonical source of development governance.
Every human or AI coding task follows its 12 required rules.

Before editing, read README, AGENTS, the system architecture and relevant ADRs
and feature guides; check for directory-specific instructions. Define one clear
outcome and its verification scope. Start independent work from the latest
fetched `origin/main` on a focused feature/fix/chore branch. If unmerged work is a
dependency, document the actual base and merge order explicitly. The recommended
module branch examples and release branch are in
[Git workflow](../../AGENTS.md#git-workflow).

During implementation, preserve the agreed architecture and package edges. Explain
new dependencies in the change description and relevant development docs. Keep
credentials out of source/Git/logs; use synthetic fixtures and isolated databases
instead of changing live learner data. Include versioned SQL migrations and
backup/rollback coverage for SQL schema changes, and a compatibility strategy for
stored JSON changes. Agent/skill changes need tests, and model outputs need schema
validation before use. Do not delete or weaken tests to conceal failures.

Before completion, run type checking, lint and relevant tests, check formatting,
review the diff and update related documentation. Report the actual results and
limitations, including checks blocked by the environment. Browser mocks do not
establish native-device or real-provider behavior. State the branch/base, commit
and verified push/merge status; creating or pushing a branch does not merge it.
Open a PR against `main` for review with CI checks passing. Release stabilization
uses `release/v0.1.0`; signing and publication follow ADR-0007.

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
For the first complete course, study material, challenge variants and independent
review answers, see [Hotel Check-in](HOTEL_CHECKIN.md).
For dynamic character replies, grounded dialogue memory and conversation support,
see [Dialogue Roleplay](DIALOGUE_ROLEPLAY.md).
For deterministic word/form matching, original evidence, practice counts and
checkpoint replay, see [Vocabulary Tracker](VOCABULARY_TRACKER.md).
For conservative grammar/word-choice diagnosis, exact error evidence, correction
delivery and saved feedback, see [Error Diagnosis](ERROR_DIAGNOSIS.md).
For in-conversation recasts, spacing, repeat suppression and delivery verification,
see [Teaching Intervention](TEACHING_INTERVENTION.md).
For explicit profiles, cross-lesson knowledge/error/episode memory, atomic writes,
legacy reads and the Memory page, see [Learning Memory](LEARNING_MEMORY.md).
For evidence-based post-lesson recaps, report history, source opening and saved
personal reflection, see [Learning Report](LEARNING_REPORT.md).
For source-grounded follow-up tasks, retrieval/production practice, saved attempts
and the due/upcoming review queue, see [Review Generator](REVIEW_GENERATOR.md).
For microphone capture, confirmed ASR input, device/provider TTS, speech settings
and platform validation requirements, see [Voice loop](VOICE_LOOP.md).

## Data locations (macOS dev)

- Database: `~/Library/Application Support/com.languagelab.desktop/language-lab.db`
- Migrations applied transactionally by the Rust core; automatic backup kept
  (last 3) before version-changing migrations.

## Before declaring any change done

1. `pnpm typecheck && pnpm lint && pnpm test`
2. `pnpm test:e2e` when the change touches UI or IPC
3. Check formatting for changed files with `pnpm exec prettier --check <paths>`;
   format those files as needed, and review the resulting diff.
4. `pnpm --filter @language-lab/desktop tauri dev` smoke run when the change
   touches the Rust core or IPC commands
5. Update the relevant ADR in `docs/adr/` if a documented decision changed.

For a documentation-only task, run type checking, lint, the default unit suite
and changed-document formatting/link checks. Do not add tests that only assert
that documentation repeats its implementation. Run e2e/native checks when the
change affects those behaviors. If a required check cannot run, explain why and
what still needs validation; do not silently skip it or describe it as passed.

## CI

- `ci.yml`: every PR — typecheck, lint, unit tests (JUnit artifact), frontend
  build, Playwright e2e (HTML report artifact).
- `desktop-build.yml`: push to main / manual — unsigned macOS universal and
  Windows NSIS/MSI bundles as artifacts. Signing is a v0.1 release
  prerequisite (see ADR-0007).

## UI language (Task 03)

Use i18next/react-i18next resources for all new UI copy from the start. Maintain
simplified Chinese, traditional Chinese and English together. Use the shared Intl
formatters for UI dates/numbers, and leave learning content in its own language.
See [Task 03](TASK_03_UI_FOUNDATION.md) for acceptance and native manual checks.
The small native locale harness runs without Tauri/GTK:
`cargo test --locked --manifest-path tests/native-locale/Cargo.toml`; CI runs it
on Linux, macOS and Windows. Full native app validation remains separate.

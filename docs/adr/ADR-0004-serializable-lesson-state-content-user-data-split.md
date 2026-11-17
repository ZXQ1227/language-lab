# ADR-0004: Teaching state is a serializable state machine; content and user data are separate

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Lessons must survive restarts, and learning data must never be clobbered by
app updates.

## Decision

- `LessonState` (`packages/core`) is a plain JSON object with a
  `schemaVersion` field, validated by Zod on every serialize/restore. Phase
  transitions are constrained by an explicit transition table (self-loops
  legal for every non-terminal phase; `done` is terminal).
- All state mutations flow through `applyTeachingAction`, a pure function.
- **`content/` is product content; the SQLite database is user data.**
  Scenario templates sync at startup with slug-based upsert
  (`ON CONFLICT(slug) DO UPDATE`), which refreshes templates only; user
  learning records are never written by the content pipeline.
- Database migrations back up the file first and keep the last 3 backups.

## Consequences

- Any lesson can be paused and restored losslessly.
- App upgrades can evolve scenario content without data-loss risk.
- Content files are validated at test time and again at parse time.

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

## Addendum: scenario course templates (08)

- Authored course content (roles, expressions, stages, criteria, policy) is
  validated with `scenarioContentSchema`. Existing metadata-only scenarios remain
  readable. Unknown versions, fields and broken stage/objective references fail.
- `initLesson` snapshots the configured course in the optional
  `LessonState.courseTemplate` field. Existing version-1 states without that field
  remain valid; serialize/restore validates new snapshots and their references.
- The scenario database row remains the existing metadata projection. Course
  edits/imports in the Scenarios page are temporary previews; JSON export is the
  explicit way to keep a configured template. They never update learning records.
- Stage selection uses objective completion state, not turn counts. Grounded
  objective evaluation is separate from this schema and template work.

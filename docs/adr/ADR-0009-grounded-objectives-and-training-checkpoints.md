# ADR-0009: Grounded stage completion and atomic Training checkpoints

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Authored stage criteria existed but no component assessed them, and Training was
a placeholder. Completing an action could mark a course objective without learner
evidence. Separate frontend IPC writes for messages, progress and events would
also allow partial turns after a failure.

## Decision

- Add one Zod-validated objective-evaluation skill. It judges the current stage,
  returning per-criterion learner citations. The core checks complete criterion
  coverage and exact learner-message quotes before accepting progress.
- Preserve verified criteria across replies, and complete a stage only when all
  criteria have evidence. Authored courses cannot complete pending objectives
  through `complete_task` alone. Legacy courses and snapshots remain readable.
- Store optional stage assessments inside `LessonState`; the existing phase
  machine governs practice, debrief and done. Finishing requires a valid report.
- Compose the runtime in the desktop Training feature. Each operation uses a
  private draft and publishes only after a successful checkpoint upsert.
- Save one versioned aggregate per lesson under a dedicated `training_checkpoint`
  event type in the existing user-owned `learning_events` table. Its payload
  contains state, full transcript, evidence, events and report. This avoids a
  schema migration and guarantees one atomic write without adding a speculative
  multi-command transaction API. Ordinary append-only learning events are not
  modified. Checkpoint aggregates are the Training source of truth; normalized
  lesson/message/report projections are separate work.
- Expose a clearly labelled, example-only guided demo and connected AI mode.
  Connected mode follows ADR-0002's temporary direct-webview gateway policy and
  existing keyring commands. Endpoint-scoped key names prevent accidental reuse
  for another connection; checkpoint metadata never includes credentials.

## Consequences

- Learner evidence and conversation survive a restart together. Failed model
  calls or writes preserve the last saved checkpoint and allow retry.
- Existing database tables and migrations remain unchanged; history/report code
  must deliberately consume Training aggregates.
- Citation validation is deterministic, while semantic criterion judgments still
  depend on the selected model. Demo matching and scripted tests are explicitly
  distinguished from real assessment quality.
- The first implementation supports at most 100 turns per lesson and lists the
  latest 50 checkpoints. Native keyring and actual model quality need separate
  validation on a supported desktop.

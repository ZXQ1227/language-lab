# System Architecture

Status: placeholder.

Authoritative decisions so far (blueprint v1.1):

1. Two processes: webview (no Node.js) and Rust core (system permissions).
2. SQLite runs in the Rust core; webview reaches it over IPC.
3. API keys live in the OS keyring. The planned Rust model proxy is described
   in ADR-0002; current connected Training calls use the gateway in the webview.
4. `content/` is read-only product data; SQLite is user data.

Sections to fill in: process diagram, IPC command surface, data flow per
conversation turn, update and backup flow.

## Scenario courses

Versioned scenario content now includes optional authored course templates with
roles, target expressions, ordered stages, success criteria and feedback budgets.
All shipped scenarios include this material; legacy metadata-only content remains
readable. Zod validates content and cross-references at the boundary; a published
JSON Schema supports authoring tools.

The scenario SQLite table continues to store its existing metadata projection.
Course content reaches the orchestrator through `ScenarioView.courseTemplate`;
`initLesson` compiles a configured copy into a validated `LessonState` snapshot.
Dialogue and deterministic interventions use this snapshot, so subsequent content
syncs cannot alter an in-progress course. No database schema changes are required.

The Scenarios page provides course previews, level/feedback configuration and
validated JSON import/export. Edits and imported previews are temporary until
exported to a file. Configured courses can now open directly in Training.
See [Scenario courses](../development/SCENARIO_COURSES.md).

## Text teaching loop

Training composes the single teaching orchestrator with either explicitly labelled
guided examples or connected AI skills. The objective evaluator returns criterion
judgments with exact learner citations. The core verifies coverage and references,
retains earlier verified evidence, and advances only a fully demonstrated stage.
The updated stage reaches dialogue generation in the same turn. A validated review
moves the last completed stage from debrief to done.

The desktop processes each operation in a private draft. One SQLite upsert saves a
versioned `training_checkpoint` aggregate in the existing `learning_events` table,
including state, transcript, evidence, domain events and report. The UI publishes
the new session after that write succeeds. These aggregates are separate from the
existing normalized lesson/message projections; no database migration or Rust
command was added. API keys remain in the OS keyring, scoped by endpoint, and are
absent from checkpoints. See [ADR-0009](../adr/ADR-0009-grounded-objectives-and-training-checkpoints.md)
and [Teaching loop](../development/TEACHING_LOOP.md).

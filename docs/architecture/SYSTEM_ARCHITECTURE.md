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

## Complete learning packs

Hotel Check-in adds an optional authored `learningPack`: preparation, vocabulary
meanings, scenario facts, model dialogue, per-stage guided material, variations and
independent review. Cross-references are validated at the content boundary.

A selected variation is recorded on the immutable source. A pure resolver
compiles its facts, stages, opening and guided prompts into the course snapshot;
the source remains editable and reusable for a different challenge. Saved-session
validation compares the snapshot with the resolved source, including after JSON
import/export. The same hotel facts reach dialogue and objective evaluation.

Independent review responses are optional learner data in the existing Training
checkpoint. Only a completed course's valid review-exercise ids are accepted.
Saving uses the same atomic upsert and failure behavior; database schema and Rust
commands are unchanged. See [Hotel Check-in](../development/HOTEL_CHECKIN.md).

## Dynamic role dialogue

Course snapshots may include an authored character profile. Reply generation uses
that profile, bounded recent dialogue, cited learner memory, current criteria and
the previous completed stage. The core validates memory updates against actual
learner practice messages and preserves at most 12 details in the existing state.
Learner statements remain distinct from authoritative scenario facts.

Help controls and recognised standalone English requests follow a separate
support path: no diagnosis, vocabulary tracking or objective evaluation. Saved
support messages cannot serve as completion evidence or memory; reviews exclude
them. Hints obey the existing budget, while exact repeat needs no model. A single
duplicate-response repair attempt is allowed before the operation fails safely.
All state, support markers and memory use the existing atomic checkpoint.
See [ADR-0010](../adr/ADR-0010-dialogue-memory-and-support-requests.md) and
[Dialogue Roleplay](../development/DIALOGUE_ROLEPLAY.md).

## Deterministic vocabulary observations

A pure core matcher now supplies the vocabulary skill, transcript replay and
Training progress display. Unicode-aware normalization and lexical boundaries
recognise exact targets plus explicitly authored course forms. Matches retain
original UTF-16 spans; no model, fuzzy inference or dictionary service is used.
Counters record practice turns containing a target, with occurrences and latest
evidence derived separately. Partner/system/help messages cannot contribute, and
lexical use never establishes mastery or completes an objective.

An optional `vocabularyTrackingVersion` marker in Training checkpoints verifies
counts against transcript evidence on restore. Legacy totals are replayed only
in the private operation draft, then committed atomically with the next successful
turn/review. Content snapshots retain their own accepted forms. No database or
IPC changes are needed. See [ADR-0011](../adr/ADR-0011-deterministic-vocabulary-observations.md)
and [Vocabulary Tracker](../development/VOCABULARY_TRACKER.md).

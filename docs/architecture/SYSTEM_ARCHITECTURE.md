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

The starter catalog orders static, validated course assets by learning goal.
The library renders those assets independently of startup seed synchronization.
SQLite continues to hold the metadata projection and additional local scenario
rows. See [ADR-0021](../adr/ADR-0021-ordered-starter-course-library.md).

Before a session exists, the Course Designer skill uses the configured model
gateway to turn a learner's goal into a version 1 scenario. It validates the
model payload and assigns objective references and policy in code. The result
opens in the usual preview and is snapshotted locally when the learner starts.
Built-in course packs remain available for first use and offline practice.
See [ADR-0019](../adr/ADR-0019-validated-ai-course-design.md).

## Free conversation

The learning plan opens a dedicated conversation with Zoi. The greeting is
local. Sending text or a confirmed transcript uses the saved AI connection
and endpoint-scoped keyring access through the same Model Gateway as Training.
The request contains a bounded window of recent conversation, and the gateway
validates a bounded reply before it reaches the transcript. Leaving the view
cancels the pending reply and speech resources. A conversation lives in memory
for that visit and never creates a lesson checkpoint or review record.

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

## Grounded language diagnosis

The model diagnosis skill receives bounded context but may cite only the current
learner reply. Core validation requires exact original spans, meaningful changes,
non-overlapping suggestions and preserved numeric sequences. Declared uncertain
suggestions are withheld; invalid schema/evidence permits one bounded repair.
Text-derived fluency is `not_assessed` and cannot trigger automatic fluency hints.

Deterministic teaching policy chooses one validated priority correction within
the existing limits. Optional per-practice diagnosis records preserve the accepted
observations and the delivered correction reference in the atomic checkpoint;
restore verifies their citations and delivery consistency. Help messages remain
excluded, original learner text remains intact, and review receives the same
source/uncertainty information. No SQL or IPC changes are required. See
[ADR-0012](../adr/ADR-0012-grounded-language-diagnosis.md) and
[Error Diagnosis](../development/ERROR_DIAGNOSIS.md).

## Gentle intervention timing and delivery

Shared core rules choose one short correction within lesson limits, leave
configurable practice intervals and suppress exact recent reminders. Optional
versioned intervention state persists practice positions and bounded delivery
marks. Training reconstructs it from actual practice and recorded corrections;
support exchanges do not advance the interval. Legacy known history is seeded
privately while preserving budgets.

Dialogue receives one approved structured correction. Its reply must include
the corrected expression and stay within a brief-response limit; one combined
repair is allowed. The orchestrator verifies delivery before counting it, and the
atomic checkpoint saves reply, history and reason together. Explanations become
optional in feedback. No SQL or IPC changes are needed. See
[ADR-0013](../adr/ADR-0013-gentle-intervention-timing-and-delivery.md) and
[Teaching Intervention](../development/TEACHING_INTERVENTION.md).

## Four-type learning memory

The memory package validates explicit profile preferences and structured lesson
contributions. Training derives knowledge/error observations and episode facts
from saved learner evidence, keeping supported practice separate from model
observations. Global memory replaces each lesson's contribution; use and diagnosis
counts never automatically establish mastery or an assessed profile level.

A single SQLite multi-row UPSERT now commits the canonical Training checkpoint
and a compact `learning_memory_contribution` row together. Profile edits use a
single profile UPSERT. Both use existing tables and IPC, with no migration. Reads
filter learner/type and page all memory sources beyond the 50-lesson resume list;
legacy checkpoints are derived without silent rewrites. The Memory page exposes
four categories, profile editing and exact source-lesson opening. Teaching receives
a bounded language-scoped view while current course facts and criteria remain
authoritative. See [ADR-0014](../adr/ADR-0014-four-type-learning-memory.md) and
[Learning Memory](../development/LEARNING_MEMORY.md).

## Evidence-based post-lesson reports

Core derives a versioned recap from the completed course snapshot, exact stage
citations, deterministic learner vocabulary matches and saved diagnosis records.
Training saves this with model commentary and the atomic checkpoint/memory pair;
restore recomputes the facts and tasks. Legacy completed sources are reconstructed
without rewriting them. Support requests, partial diagnosis coverage and legacy
delivery flags retain their provenance instead of implying independent mastery.

Training and Reports share a report view. Reports reads all completed episodes,
loads individual source checkpoints without replacing active practice, and saves
bounded personal reflection separately from evidence. Next tasks come from known
issues, unused vocabulary and authored review exercises. Model commentary and its
subjective score are explicitly separated from lesson facts. No new database,
IPC or dependency edges are introduced. See
[ADR-0015](../adr/ADR-0015-evidence-based-learning-reports.md) and
[Learning Report](../development/LEARNING_REPORT.md).

## Targeted follow-up review

The registered Review Generator now derives bounded typed practice from completed
course evidence, using the same deterministic core rules in AI and demo modes.
It selects recurring short diagnosis patterns, unused words and contextual
transfer practice, retaining exact source/uncertainty and authored examples.
Suggested dates and self-reported completion are distinct from assessed mastery.

An optional versioned `reviewPlan` lives in the canonical Training checkpoint.
The existing multi-row SQLite UPSERT co-commits it, its queue mirror and the
memory contribution atomically. Paginated learner/type-filtered queue reads are
independent of the latest-50 resume window; opening or saving a task validates
the original source. Source-grounded targets are replay-validated, while personal
attempts keep bounded history, deterministic check results and optional example
support without rewriting original teaching evidence. The Review page supports
due/upcoming/practised views, answers, self-check, retry and source opening. Legacy
plans generate explicitly and idempotently. No schema migration, IPC or dependency
edge changes are needed. See
[ADR-0016](../adr/ADR-0016-targeted-follow-up-review.md) and
[Review Generator](../development/REVIEW_GENERATOR.md).

## Confirmed voice input and reply playback

OpenAI-compatible ASR/TTS adapters now implement the existing Model Gateway audio
interfaces with bounded bodies, full-call deadlines, cancellation and sanitized
errors. Nonsecret speech settings use a learner-scoped SQLite event; credentials
remain in separate endpoint-scoped OS keyring entries. The direct-fetch fallback
in ADR-0002 remains in effect and requires provider CORS support.

Training captures audio on explicit action, negotiates the platform's supported
MediaRecorder format and shows an editable recognition preview before the learner
adds it to the composer and sends it. Only confirmed words enter teaching and
the atomic checkpoint. Optional speech provenance is backward compatible and
cannot establish pronunciation, oral fluency or mastery. Audio and raw recognition
drafts are never persisted. Track/resource cleanup and generation guards prevent
late microphone, recognition or playback results crossing lesson/navigation
boundaries. Reply reading uses matching installed local voices or configured MP3
TTS; opt-in automatic reading occurs only after successful saves. See
[ADR-0017](../adr/ADR-0017-confirmed-speech-and-reply-playback.md) and
[Voice loop](../development/VOICE_LOOP.md) for native permission configuration,
transport limits and the required physical-device validation matrix.

Playback resolves a character's optional voice style and known name against the
learner's voice preference. It then selects an installed same-language device
voice or a compatible provider voice ID. Older course and speech preference
payloads stay readable. See [ADR-0020](../adr/ADR-0020-character-voice-selection.md).

## Interface language and region

Rust reads preferred OS UI language and independent regional settings through
`get_system_locale`; the validated frontend locale store combines them with a
versioned manual/system preference in the existing `learning_events` table.
i18next resources rerender all current pages without changing learning state.
The interface supports simplified Chinese, traditional Chinese and English, with
English fallback for unsupported languages. UI locale never changes course,
model, profile or speech-language inputs. See
[ADR-0018](../adr/ADR-0018-system-locale-interface-language.md).

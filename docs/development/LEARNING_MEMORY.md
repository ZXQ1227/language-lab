# Four-type Learning Memory

Learning memory reads and writes local data across Training and free conversation.
The **Learning memory** page edits a stated profile, shows knowledge/error
observations and practice episodes, and opens their source lessons. Package
`@language-lab/memory` provides validated contribution, projection and retrieval
functions without a model, vector database or cloud backend.

## The four types

| Type      | Written from                                              | Meaning                                                                                                                                                                    |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile   | Explicit language, CEFR level and goal edits              | Stated preferences, never an automatically assessed level or fictional roleplay identity.                                                                                  |
| Knowledge | Canonical target terms and exact learner-practice matches | Turns, occurrences, source and separate guided/free-format counts. New or learning, not automatic mastery.                                                                 |
| Error     | Accepted diagnosis observations                           | Exact category/original/corrected patterns, practice-reply counts, explanation, source and separate model/demo counts. Historical judgments, not proof of a current error. |
| Episodic  | Saved lesson metadata and verified progress               | One current episode per lesson, with language, mode, completion, counts and deterministic summary. No invented personal details or autobiographical facts.                 |

The stated profile is a single current profile per local learner. Defaults are
explicitly labelled and are not an assessment. Saving a profile changes neither
an active course's language/difficulty nor objective evidence. Practice, reports
and guided examples never promote the profile level automatically.

Knowledge counts at most once per term per practice reply, with occurrences
tracked separately. Assistant/system text and support requests do not count.
Error patterns count once per learner reply even if multiple spans show the same
fix. Confidence-filtered or unsupported diagnoses produce no error observation.
Guided/demo observations remain distinguishable from connected AI practice; none
establish independent mastery or resolution of an error.

Episodes represent saved in-progress or completed practice. Completion requires
the existing finished lesson/report flow and all verified objectives. Summary
text is composed from structured progress, not from an unchecked model narrative.
Timestamps mean **last saved snapshot**, not precise timestamps of every utterance.
Resaving review answers updates that episode instead of creating another one.

## Persistence and atomic writes

In Learning Memory, **Use learning memory across sessions** controls whether
new Training and free-conversation requests include past vocabulary,
corrections and episodes. It is on for existing installations with no saved
preference. Turning it off preserves the local history and keeps the current
conversation and explicit learner profile available. The preference is a
version-1 `memory_settings` event in the existing table.

Each episode can reopen its exact source or be permanently deleted after a
second confirmation. A single learner- and type-scoped SQLite statement
removes the checkpoint, memory contribution and any directly linked review
plan together. The app then recomputes memory from the remaining sources;
knowledge and errors supported by other sources remain visible.

An optional version-1 `TrainingSession.learningMemory` contribution snapshots a
lesson's knowledge, errors and episode facts. The desktop recomputes it from the
immutable course, actual learner transcript, diagnoses and state, and validates
the saved projection against those sources. It contains no provider keys or
endpoint settings. User records never enter shipped `content/`.

Successful Training writes use **one SQLite multi-row UPSERT** in the existing
`learning_events` table:

- `training-{lessonId}` / `training_checkpoint`: the canonical full lesson.
- `memory-{lessonId}` / `learning_memory_contribution`: its compact memory
  projection, using the same learner and commit.

SQLite commits both or neither. A rejected memory row cannot leave a newer
checkpoint behind, and UI state publishes only after the statement succeeds.
The projection replaces a lesson by id rather than incrementing global totals;
retry, restore, support or a repeated summary cannot double-count observations.
Global projection prefers newer turn revisions and terminal completion when
revisions otherwise tie.

Free conversation saves after each successful exchange, including replies sent
from a confirmed speech transcript. The version-1 chat checkpoint stores the
original turns and their validated evidence. Useful vocabulary candidates must
match the learner's own words. Error observations require a high-confidence
diagnosis and an exact quote. Explicit help requests contribute to the transcript
and episode history. Practice evidence comes from regular learner replies.
The existing optional diagnosis also records an explicitly checked result with
an empty error list. This feeds the **Checked** indicator and adds no error
observation. Older version-1 checkpoints with no such record still open.

When the provider repeatedly returns blank structured output, Zoi requests a
plain-text reply using the same recent messages. A validated text reply can
continue the chat and contributes the exchange to its episode. Vocabulary and
correction evidence are only saved when the provider supplies valid structured
observations. If the provider still returns no usable reply, the draft remains
editable and the previous saved exchange stays intact.

SQLite writes `free_conversation_checkpoint` and `free_conversation_memory`
together. A failed write leaves the previous recording intact and allows retry
with the same drafted reply. Each chat contributes one current episode. Open the
source from Learning memory to read and continue it. The Home entry starts a new
chat. Later replies can use up to eight English vocabulary observations and three
short error patterns from the local memory. A saved chat's full transcript is
available when you reopen it. These new version-1 event types are ignored by
older readers and use the existing table schema.

Profiles use one `student_profiles` UPSERT for language, level and goals together.
It preserves an existing profile's id/creation time. The memory boundary validates
language code, CEFR enum and at most ten goals of 200 characters each before
writing. A failed profile write keeps the old saved values and the unsaved editor
draft. The existing normalized `student_knowledge` and `error_records` tables are
preserved; Training memory in this version deliberately consumes its evidenced
checkpoint contributions instead of treating those independent tables as a
second source of truth.

No migration, additional native command or change to the IPC protocol is needed.
SQLite still runs in Rust and all SQL stays in database repositories. The package
adds Zod boundary validation already used elsewhere; no runtime Node/native driver
is introduced into the webview.

## Reading, restore and legacy records

Repository reads filter the learner id and record type, validate payloads and
source identity, and use keyset pages of 100. They read all memory sources,
independently of the latest-50 Training resume list. Opening a memory's source
reads that exact lesson id, so an older source can still be inspected.

Old checkpoints without a contribution remain readable. The reader loads only
legacy sources lacking a memory projection, validates their full Training data
and derives observations without silently rewriting old records. The next
successful Training save creates the projection atomically. Missing historical
diagnoses are not invented. Invalid records surface an error with retry rather
than resetting memory or silently ignoring a learner's history.

The Memory page has loading/error/data states, explicit refresh and source links.
Large knowledge, error and episode lists can show more records without dropping
older data. Language filtering changes the view, not storage. Training and profile
operations share the existing busy/commit guard, preventing a refresh from
overwriting a just-published local save.

## Using memory in teaching

Training loads the saved profile and a language-scoped `MemorySnapshot` into the
existing skill context. Dialogue receives at most three short goals, eight
relevant vocabulary entries (observed terms first), three error patterns and two
short episode summaries. The underlying retrieved view allows up to twenty
relevant words, ten error patterns and five episodes. Other-language goals and
observations are excluded; stored records remain intact.

The prompt labels memory as untrusted historical observations, distinguishes
defaults/self-reports and retains guided/model provenance. Current course level,
facts, role and criteria remain authoritative. Historical errors do not justify
a new diagnosis, usage does not imply mastery, and earlier fictional names or
hotel facts cannot become a real user profile. The per-lesson quoted dialogue
memory remains separate from this cross-lesson learning memory.

There is no model write API for the profile or global memory. Only validated
practice projections and explicit profile edits can change stored memory. Memory
may help the partner choose natural practice, but cannot complete objectives or
bypass correction/hint budgets.

Optional speaking-practice indexes allow finished course reports to recommend a
ready expression from the same category and language when cross-session reuse
is enabled. Transfer attempts are persisted with the source checkpoint, so
deleting that source removes both the attempt and its recommendation. See
[Contextual speaking practice](CONTEXTUAL_SPEAKING_PRACTICE.md).

## Verification and limits

Tests exercise contribution grounding, replacement/idempotency, language scope,
supported/model provenance, completed episodes, legacy reads, source identity and
retrieval into a later lesson's actual prompt. A real SQLite test loads the shipped
migration and injects a trigger failure on the second UPSERT row to verify rollback
of the checkpoint. It also tests profile rollback, paging beyond 50 lessons and
another learner's exclusion. These tests use Node's built-in SQLite on Node
22.13+; on Node 20 only those native-engine tests skip.

Browser tests use mocked Tauri IPC to exercise profile edits/failure, cross-lesson
and restart persistence, source opening, completion, read-error retry, paired
write failure and legacy upgrade. Model transport responses remain scripted;
memory persistence and scope are tested, while live-model pedagogical benefits
and native desktop behavior still require separate evaluation.

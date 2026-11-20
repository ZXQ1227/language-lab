# Text teaching loop

## Try a lesson

Open **Home → Course library → Scenario roleplay**, review the course vocabulary and sample
sentences, choose a practice mode, then select **Start lesson**.
Alternatively, configure or import a course in **Scenarios**, then select
**Practise this course**. The selected course, level and feedback policy are
copied into the saved practice session.

An active lesson fills the window. The header shows the current goal and
progress. A partner card introduces **Zoi** or the course's named character.
Partner and learner turns sit on opposite sides of the conversation, with
playback alongside each partner reply. The conversation scrolls independently
of the dock at the bottom.

The dock groups course details and practice shortcuts above the keyboard,
microphone and hint controls. **Lesson details** opens criteria, course
materials, vocabulary evidence and saved practice. Toggle **Keyboard** to
show or hide the current text draft. **Exit lesson** returns to the page that
opened practice. Reopen Scenario roleplay or choose **Continue lesson** on the
plan to resume saved turns.

- **Guided demo** is available for the unchanged teaching material in bundled
  courses (level and feedback settings may change). It checks the suggested
  example replies using deterministic matching. Other replies do not award
  completion. Demo reviews explicitly identify themselves as demonstrations and
  do not show a proficiency score.
- **Connected AI** accepts an OpenAI-compatible chat-completions endpoint and
  model. It uses real diagnosis, objective evaluation, dialogue and review
  skills. Local models can use `http://localhost:11434/v1` without a key when the
  local provider permits it. Other endpoints require HTTPS and a saved key.
  The selected provider must support JSON responses and browser-origin requests.

In **Settings → AI connection**, save the endpoint and model, then use **Test AI
connection**. Saved means the local configuration was written. Verified means
the selected model returned the expected JSON in a bounded chat-completions
request containing a fixed test instruction. It sends no practice text or
learning memory. Verification status is kept for the current app run and
invalidated when the configuration is saved again. It is a point-in-time check.
Training, free conversation and AI course design share the endpoint policy;
only HTTPS and loopback HTTP without URL credentials, queries or fragments are
allowed. When the connection is unavailable, bundled guided practice remains
available. Unsent free-chat text and course-design goals survive navigation
within the current app run.

When changing bundled teaching material, review the associated demo answers in
`apps/desktop/src/training/session.ts` against the new success criteria.

API keys go through the existing Rust `secrets_*` commands to the OS keyring.
The key name is derived from a SHA-256 hash of the exact normalized endpoint;
changing hosts or endpoint paths does not reuse another endpoint's key. Keys are
read only when constructing a live gateway, never included in checkpoints or
webview storage. The password field clears after the operation. **Update
connection key** updates the key for an existing AI session.

Connected mode sends learner conversation to the selected provider. It currently
uses direct webview requests as permitted by ADR-0002 until the Rust model proxy
lands. This feature adds no cloud backend and no Node/native dependency to the
webview.

## What advances a stage

Training classifies inputs before they contribute evidence. Explicit support and
recognised standalone help requests do not enter assessment. When an answer
follows a recognised help clause, the transcript keeps the full message and
`practiceStart` identifies the UTF-16 start of the answer. The assessor and
diagnosis see the answer, while saved citations refer to the original message.
Clear control requests to mark work complete and noise-only speech transcripts
receive a redirect or clarification and contribute no evidence.

The connected `skills.objective_evaluator` returns the latest reply's relevance
and one assessment per zero-based success-criterion index, with `met`, cited
`messageSeq`/`quote` pairs, and feedback. Out-of-scene, unclear and timed-out
assessments leave the previous verified progress intact. Those messages stay in
the transcript as `non_practice` and are excluded from vocabulary, diagnosis,
learning memory and report evidence. For eligible replies, diagnosis and
deterministic vocabulary tracking run before the teaching action and reply.

The core validates before changing state:

1. The stage is the current stage; every criterion appears exactly once.
2. Every met criterion has at least one nonempty citation.
3. Each citation quotes the eligible answer from an existing **learner**
   message exactly. Help text, excluded turns, assistant examples, unknown
   message ids and invented quotes are rejected.
4. Previously verified criteria remain met while their citations remain valid.
5. All criteria must be met before completing that stage's objectives.

Evidence is stored in the additive `LessonState.stageAssessments` field and
survives restore. Multiple learner replies can supply evidence for one stage.
Turn count, vocabulary matching or a `complete_task` action alone cannot complete
objectives in an authored course. Legacy metadata-only lessons retain their old
action behavior and existing snapshots remain readable.

The first assessed reply transitions briefing → practice. Verified completion of the last
stage transitions practice → debrief. **Finish and review** runs the lesson
evaluator and transitions debrief → done only after a valid report. Sending more
practice turns after debrief/done is rejected. The partner receives the updated
stage in the same turn, so it can ask about the next task immediately.
For a partially completed stage, dialogue receives verified criterion progress
and is instructed to elicit an unmet criterion rather than repeat completed checks.

Quote validation establishes that evidence exists; the connected model still
judges whether the quoted language satisfies a criterion. These judgments and
review scores are learning feedback, not independently validated proficiency
certification. Tests verify protocol, state and persistence behavior with scripted
responses; they do not measure a real model's teaching quality.

## Saved practice and failure handling

Completed operations save a versioned `training_checkpoint` in the existing
SQLite `learning_events` table, containing the source course, state, evidence,
conversation, domain events, provider metadata and optional report. All SQL is
in repositories; frontend IPC uses `src/lib/ipc.ts`.

One parameterized upsert atomically replaces the full checkpoint for a lesson.
No database migration or new Rust command is necessary. `Training` uses these
aggregates rather than writing partial projections into the existing lessons,
conversations and messages tables. Future report/history projections must read
these aggregates or explicitly materialize them; they must not assume those
tables already contain Training sessions.

Each operation builds a private runtime draft. The UI publishes it only after
the checkpoint write succeeds. Model failures, invalid evidence, failed report
generation and failed checkpoint writes leave the previous saved state intact.
The learner's draft remains available for retry. A single busy guard prevents
overlapping start/send/finish operations. The UI distinguishes a model failure
from a save failure. Retrying the same draft on the same saved session after a
write failure reuses the validated result and performs only the checkpoint
write. The in-memory retry result expires when practice is replaced. The model
portion of each turn has a 50-second budget across skills and internal retries.

Reloading restores the most recently updated valid session. **Saved practice**
switches between the latest 50 sessions. Older checkpoints stay in SQLite. New
lessons keep previous sessions. The current text lesson limit is 100 learner
turns, keeping the full learner evidence inside the 200-message history window.
An active session can be paused with **Exit lesson**. **End practice early**
saves the current evidence in an unfinished summary. An incomplete lesson that
reaches the same 100-turn limit opens this summary automatically. The summary
lists verified citations and outstanding criteria, and permits a fresh attempt
with the same course. Unfinished sessions have no completion report or review
plan. The optional `endedEarly`, `practiceStart`, and evidence-status fields
extend the version-1 checkpoint. Older payloads keep their original evidence
and remain readable without a database migration. Unsent drafts stay in memory.

Conversation help uses a separate non-assessed path. Support exchanges do not
complete criteria or add vocabulary/errors; they are excluded from review
transcripts. They count toward the same physical exchange limit. The lesson
checkpoint also preserves grounded dialogue memory and the previous dialogue
move. See [Dialogue Roleplay](DIALOGUE_ROLEPLAY.md).

## Verification

Run the standard checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e --workers=2
pnpm --filter @language-lab/desktop build
```

Core tests cover wrong/duplicate/missing criteria, invented and partner quotes,
partial evidence, cross-turn evidence and state restore. Desktop tests cover all
three guided courses, actual structured skill contracts, model-output rejection,
immutable drafts, provider metadata and checkpoint replacement/failure. Playwright
tests cover practice → reload → stage progress → review, write-failure retry,
configured-course handoff, and the connected provider branch with intercepted
chat-completions responses and a keyring mock. Native keyring, actual model
quality and macOS Tauri behavior require separate on-device validation.

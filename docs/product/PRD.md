# Product Requirements Document

Status: placeholder. The product definition and engineering blueprint live in
the Sayden Engineering Blueprint v1.1 (see AGENTS.md status note).

Scope to fill in:

1. Target user and problem statement
2. Learning loop: scenario selection → roleplay → correction → review
3. Feature tiers per release (v0.1 ... v1.0)
4. Non-goals (no social features, no cloud accounts in v1)

## Desktop learning workspaces

- **Home** has a learning plan and course library. The plan links to unfinished
  practice and completed lessons, and recommends a bundled course based on the
  saved target language and CEFR level. Among comparable courses it favors
  courses absent from the recent completed checkpoints. A floating entry opens
  an English conversation with Zoi using the configured AI and speech settings.
  The library contains
  scenario roleplay, the guided Hotel Check-in lesson, and listening practice.
  Listening uses the device or configured TTS voice to read the authored
  opening line and leads into the same course.
- **Review** brings together the existing follow-up queue, vocabulary
  observations, sentence practice from course tasks, corrections and lesson
  reports. History groups records by the local date of their last saved activity.
- **My learning** shows the local profile and counts from saved learning evidence,
  with access to learning memory and settings. System diagnostics live in Settings.

The three workspaces use a floating bottom bar in narrow windows and a sidebar
in wide windows. Zustand tracks the current page and the page that opened
practice. The existing course, memory, review and reporting stores continue to
provide lesson snapshots and review sources. Free conversation lasts for the
current visit. Image tools, translation and a separate saved sentence
collection require their own product work.

## P0 learning-flow contracts

- **AI connection**. Saving settings stores the endpoint/model locally and the
  key in the OS keyring. An explicit verification checks the model's structured
  output using a fixed prompt. Practice modes use the same endpoint rules.
  Free-chat drafts and course-design goals are retained when switching to
  Settings or bundled guided practice during the current run.
- **Training evidence**. Help, unrelated answers and unresolved recognition do
  not advance criteria or contribute vocabulary and errors. A mixed reply can
  supply evidence from its answer portion. Validated replies become visible
  after checkpoint save. A storage failure permits a retry with the same draft.
  An unfinished close or the turn limit exposes saved evidence and next criteria
  from the checkpoint, with a fresh-attempt action.

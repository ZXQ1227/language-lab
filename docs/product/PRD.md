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
  courses absent from the recent completed checkpoints.
- **Conversation** opens scenario roleplay, the guided Hotel Check-in lesson,
  and listening practice using authored opening lines. Listening uses the
  existing device or configured TTS voice and leads into the same course.
- **Review** brings together the existing follow-up queue, vocabulary
  observations, sentence practice from course tasks, corrections and lesson
  reports. History groups records by the local date of their last saved activity.
- **My learning** shows the local profile and counts from saved learning evidence,
  with access to learning memory and settings. System diagnostics live in Settings.

The four workspaces and their subpages use Zustand navigation and the existing
course, memory, review and reporting stores. Existing lesson snapshots and review
sources retain their meaning. This iteration groups the teaching capabilities
already supported by the app and adds the listening entry point. Free conversation,
image tools, translation and a separate saved sentence collection require their
own product work.

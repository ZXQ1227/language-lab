// @language-lab/core
// Lesson / conversation / event domain types and the teaching state machine.
// Only type definitions at this stage - no business logic yet.
//
// Planned submodules (do not create until they have real content):
//   lesson/  conversation/  events/  state-machine/

export type LessonPhase = "setup" | "briefing" | "practice" | "debrief" | "done";

export interface LessonState {
  readonly lessonId: string;
  readonly scenarioId: string;
  readonly phase: LessonPhase;
  readonly objectiveCount: number;
  readonly completedObjectives: number;
}

export type TeachingAction =
  | "continue_conversation"
  | "light_correction"
  | "provide_hint"
  | "change_difficulty"
  | "complete_task";

export interface LearningEvent {
  readonly kind: "vocabulary_used" | "error_made" | "objective_completed" | "hint_requested";
  readonly at: string;
  readonly payload: Record<string, unknown>;
}

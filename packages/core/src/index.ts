// @language-lab/core
// Lesson / conversation / event domain types and the teaching state machine.
//
// LessonState is the single source of teaching truth for the orchestrator.
// It must be serializable: the whole state is a plain JSON object validated
// by lessonStateSchema, so it round-trips through SQLite / IPC / backups.

import { z } from "zod";

export type LessonPhase = "setup" | "briefing" | "practice" | "debrief" | "done";

export const lessonPhaseSchema = z.enum(["setup", "briefing", "practice", "debrief", "done"]);

export type TeachingAction =
  | "continue_conversation"
  | "light_correction"
  | "provide_hint"
  | "change_difficulty"
  | "complete_task";

export const teachingActionSchema = z.enum([
  "continue_conversation",
  "light_correction",
  "provide_hint",
  "change_difficulty",
  "complete_task",
]);

export interface LessonObjective {
  readonly id: string;
  readonly description: string;
  readonly completed: boolean;
}

export const lessonObjectiveSchema = z.object({
  id: z.string(),
  description: z.string(),
  completed: z.boolean(),
});

/** Counters for vocabulary the student has produced during the lesson. */
export type VocabularySeen = Record<string, number>;

/**
 * Serializable teaching state. schemaVersion lets future migrations evolve
 * the shape without silently corrupting restored sessions.
 */
export interface LessonState {
  readonly schemaVersion: 1;
  readonly lessonId: string;
  readonly scenarioId: string;
  readonly phase: LessonPhase;
  readonly difficulty: string;
  readonly objectives: readonly LessonObjective[];
  readonly targetVocabulary: readonly string[];
  readonly vocabularySeen: VocabularySeen;
  readonly turnCount: number;
  readonly correctionsGiven: number;
  readonly hintsGiven: number;
  readonly updatedAt: number;
}

export const lessonStateSchema = z.object({
  schemaVersion: z.literal(1),
  lessonId: z.string().min(1),
  scenarioId: z.string().min(1),
  phase: lessonPhaseSchema,
  difficulty: z.string().min(1),
  objectives: z.array(lessonObjectiveSchema),
  targetVocabulary: z.array(z.string()),
  vocabularySeen: z.record(z.string(), z.number()),
  turnCount: z.number().int().nonnegative(),
  correctionsGiven: z.number().int().nonnegative(),
  hintsGiven: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

/** Allowed phase transitions - anything else is a state machine violation.
 *  Self-loops are legal for every non-terminal phase (multiple turns can
 *  happen within one phase). */
export const PHASE_TRANSITIONS: Readonly<Record<LessonPhase, readonly LessonPhase[]>> = {
  setup: ["setup", "briefing", "done"],
  briefing: ["briefing", "practice", "done"],
  practice: ["practice", "debrief", "done"],
  debrief: ["debrief", "done"],
  done: [],
};

export function canTransition(from: LessonPhase, to: LessonPhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

export function createInitialLessonState(input: {
  lessonId: string;
  scenarioId: string;
  difficulty?: string;
  objectives?: readonly { id: string; description: string }[];
  targetVocabulary?: readonly string[];
  now?: number;
}): LessonState {
  return {
    schemaVersion: 1,
    lessonId: input.lessonId,
    scenarioId: input.scenarioId,
    phase: "briefing",
    difficulty: input.difficulty ?? "A2",
    objectives: (input.objectives ?? []).map((o) => ({ ...o, completed: false })),
    targetVocabulary: [...(input.targetVocabulary ?? [])],
    vocabularySeen: {},
    turnCount: 0,
    correctionsGiven: 0,
    hintsGiven: 0,
    updatedAt: input.now ?? Date.now(),
  };
}

/** Deterministic state update for one teaching action. Pure function. */
export function applyTeachingAction(
  state: LessonState,
  action: TeachingAction,
  patch?: { vocabularyUsed?: readonly string[]; now?: number },
): LessonState {
  const now = patch?.now ?? Date.now();
  const vocabularySeen: VocabularySeen = { ...state.vocabularySeen };
  for (const word of patch?.vocabularyUsed ?? []) {
    const key = word.toLowerCase();
    vocabularySeen[key] = (vocabularySeen[key] ?? 0) + 1;
  }

  let objectives = state.objectives;
  if (action === "complete_task") {
    const index = objectives.findIndex((o) => !o.completed);
    if (index >= 0) {
      objectives = objectives.map((o, i) => (i === index ? { ...o, completed: true } : o));
    }
  }

  const allCompleted = objectives.length > 0 && objectives.every((o) => o.completed);
  let phase = state.phase;
  if (action === "complete_task" && allCompleted && phase === "practice") {
    phase = "debrief";
  }

  const next: LessonState = {
    ...state,
    phase,
    objectives,
    vocabularySeen,
    turnCount: state.turnCount + 1,
    correctionsGiven: state.correctionsGiven + (action === "light_correction" ? 1 : 0),
    hintsGiven: state.hintsGiven + (action === "provide_hint" ? 1 : 0),
    updatedAt: now,
  };
  if (!canTransition(state.phase, next.phase)) {
    throw new Error(`illegal phase transition ${state.phase} -> ${next.phase}`);
  }
  return next;
}

export function serializeLessonState(state: LessonState): string {
  // parse-then-stringify guarantees we never persist an invalid state.
  return JSON.stringify(lessonStateSchema.parse(state));
}

export function restoreLessonState(json: string): LessonState {
  return lessonStateSchema.parse(JSON.parse(json));
}

export type LearningEventKind =
  "vocabulary_used" | "error_made" | "objective_completed" | "hint_requested";

export interface LearningEvent {
  readonly kind: LearningEventKind;
  readonly at: string;
  readonly payload: Record<string, unknown>;
}

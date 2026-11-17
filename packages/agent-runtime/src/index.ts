// @language-lab/agent-runtime
// Teaching Agent orchestrator: receives student input, loads state and memory,
// routes to skills, and decides the teaching action.
//
// Blueprint rule: "analyze student utterance" and "generate roleplay response"
// are separate steps. The orchestrator uses structured analysis + deterministic
// logic for teaching decisions. No implementation yet.

import type { LearningEvent, LessonState, TeachingAction } from "@language-lab/core";

export interface StudentUtteranceAnalysis {
  readonly intent: string;
  readonly vocabularyUsed: readonly string[];
  readonly suspectedErrors: readonly string[];
}

export interface OrchestratorTurn {
  readonly analysis: StudentUtteranceAnalysis;
  readonly teachingAction: TeachingAction;
  readonly events: readonly LearningEvent[];
}

export interface Orchestrator {
  /** Processes one student turn end-to-end. Implementation comes later. */
  processStudentTurn(input: string, lessonState: LessonState): Promise<OrchestratorTurn>;
}

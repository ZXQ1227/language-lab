// AgentInput / AgentOutput - the orchestrator's public contract.

import type { CourseConfiguration, LessonState, TeachingAction } from "@language-lab/core";
import type { DiagnosedError } from "@language-lab/skills";

export type ConversationMode = "text" | "voice";

export interface AgentInput {
  readonly userId: string;
  readonly lessonId: string;
  readonly conversationId: string;
  readonly utterance: string;
  /** ASR confidence if the input came through the voice path. */
  readonly confidence?: number;
  readonly mode: ConversationMode;
}

export interface LessonInitInput {
  readonly userId: string;
  readonly lessonId: string;
  readonly conversationId: string;
  readonly studentLevel: string;
  readonly studentGoals: readonly string[];
  readonly configuration?: CourseConfiguration;
  readonly scenarioCandidates: readonly {
    id: string;
    slug: string;
    title: string;
    category: string;
    difficulty: string;
    objectives: readonly string[];
    targetVocabulary: readonly string[];
  }[];
}

/** What the orchestrator decided and produced for one student turn. */
export interface AgentOutput {
  readonly turnId: string;
  readonly reply: string;
  readonly teachingAction: TeachingAction;
  readonly analysis: {
    readonly intent: string;
    readonly vocabularyUsed: readonly string[];
    readonly vocabularyMissed: readonly string[];
    readonly errors: readonly DiagnosedError[];
    readonly fluency: "fluent" | "hesitant" | "halting";
  };
  readonly state: LessonState;
  /** Domain events the orchestrator persisted through the data ports. */
  readonly persistedEvents: readonly { type: string; payload?: Record<string, unknown> }[];
  readonly skillTrace: readonly { skillId: string; durationMs: number; ok: boolean }[];
  readonly elapsedMs: number;
}

export interface LessonInitOutput {
  readonly state: LessonState;
  readonly scenarioId: string;
  readonly rationale: string;
}

// Skill execution context and the narrow data ports skills are allowed to use.
//
// Boundary rules (Task 06):
// - Skills never touch the database directly. All reads/writes go through
//   SkillDataPorts, which the composition root backs with repositories.
// - Skills never touch the UI. They return data; the orchestrator routes it.
// - All model access goes through the ModelGateway in the context.

import type { CourseTemplate, EvidenceMessage, LessonState } from "@language-lab/core";
import type { MemorySnapshot } from "@language-lab/memory";
import type { ModelGateway } from "@language-lab/model-gateway";

/** Read-only scenario view handed to skills. */
export interface ScenarioView {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly category: string;
  readonly difficulty: string;
  readonly objectives: readonly string[];
  readonly targetVocabulary: readonly string[];
  readonly courseTemplate?: CourseTemplate;
}

export type MessageRole = "user" | "assistant" | "system";

export type MessageView = Readonly<EvidenceMessage>;

/** Student profile as seen by skills. */
export interface StudentProfileView {
  readonly userId: string;
  readonly targetLanguage: string;
  readonly level: string;
  readonly goals: readonly string[];
}

/**
 * The only way skills reach persistent data. Implemented over repositories
 * by the composition root; faked in tests. Intentionally narrow.
 */
export interface SkillDataPorts {
  findScenario(scenarioId: string): Promise<ScenarioView | null>;
  recentMessages(conversationId: string, limit: number): Promise<readonly MessageView[]>;
  recordLearningEvent(event: { type: string; payload?: Record<string, unknown> }): Promise<void>;
}

export interface SkillContext {
  readonly signal?: AbortSignal;
  readonly userId: string;
  readonly lessonId: string;
  readonly conversationId: string;
  readonly studentProfile: StudentProfileView;
  readonly lessonState: LessonState;
  readonly memory: MemorySnapshot;
  readonly modelGateway: ModelGateway;
  readonly data: SkillDataPorts;
}

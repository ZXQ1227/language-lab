// @language-lab/skills
// Skill contract shared by every skill implementation.
//
// Every skill must declare zod schemas for its input and output so the
// orchestrator can validate LLM outputs at the boundary.

import type { LessonState } from "@language-lab/core";
import type { ModelGateway } from "@language-lab/model-gateway";
import type { MemorySnapshot } from "@language-lab/memory";
import type { ZodSchema } from "zod";

export interface SkillContext {
  readonly userId: string;
  readonly lessonId: string;
  readonly conversationId: string;
  readonly studentProfile: Record<string, unknown>;
  readonly lessonState: LessonState;
  readonly memory: MemorySnapshot;
  readonly modelGateway: ModelGateway;
}

export interface SkillDefinition<TInput, TOutput> {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  execute(input: TInput, context: SkillContext): Promise<TOutput>;
}

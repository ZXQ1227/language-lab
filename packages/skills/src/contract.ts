// Skill contract shared by every skill implementation.
//
// Every skill must declare zod schemas for its input and output so the
// registry can validate both boundaries: LLM outputs entering the system
// and skill results consumed by the orchestrator.

import type { ZodSchema } from "zod";
import type { SkillContext } from "./context";

export interface SkillDefinition<TInput, TOutput> {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  execute(input: TInput, context: SkillContext): Promise<TOutput>;
}

/** Type-erased skill as stored in the registry. */
export type AnySkillDefinition = SkillDefinition<unknown, unknown>;

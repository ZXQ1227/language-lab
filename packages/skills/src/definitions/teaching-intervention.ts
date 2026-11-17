// TeachingIntervention - the deterministic teaching decision.
// Rules only (no LLM) per blueprint: correction policy must be predictable
// and tunable, never left to model whim.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { SkillContext } from "../context";
import { teachingActionSchema, teachingPolicySchema } from "@language-lab/core";

const inputSchema = z.object({
  errors: z.array(
    z.object({
      category: z.string(),
      original: z.string(),
      corrected: z.string(),
      explanation: z.string(),
    }),
  ),
  fluency: z.enum(["fluent", "hesitant", "halting", "not_assessed"]),
  hintsGiven: z.number().int().nonnegative(),
  correctionsGiven: z.number().int().nonnegative(),
  allObjectivesCompleted: z.boolean(),
  /** Total objectives; 0 means the lesson has none (free conversation). */
  objectiveCount: z.number().int().nonnegative(),
  policy: teachingPolicySchema.optional(),
});

const outputSchema = z.object({
  action: teachingActionSchema,
  rationale: z.string(),
  correction: z
    .object({
      original: z.string(),
      corrected: z.string(),
      explanation: z.string(),
    })
    .optional(),
});

export type TeachingInterventionInput = z.infer<typeof inputSchema>;
export type TeachingInterventionOutput = z.infer<typeof outputSchema>;

export function createTeachingInterventionSkill(): SkillDefinition<
  TeachingInterventionInput,
  TeachingInterventionOutput
> {
  return {
    id: "skills.teaching_intervention",
    version: "0.1.0",
    description: "Deterministic teaching decision: correct, hint, continue or complete.",
    inputSchema,
    outputSchema,
    async execute(input, _context: SkillContext) {
      if (input.allObjectivesCompleted) {
        return {
          action: "complete_task",
          rationale: "all lesson objectives are completed",
        };
      }

      // Authored courses enforce explicit per-lesson caps. Legacy lessons
      // retain their existing light-touch correction heuristic.
      const correctionBudgetOk = input.policy
        ? input.policy.correctionMode === "gentle" &&
          input.correctionsGiven < input.policy.maxCorrections
        : input.correctionsGiven <
          Math.ceil((input.hintsGiven + input.correctionsGiven + 1) / 3) + 1;
      const firstError = input.errors[0];
      if (firstError && correctionBudgetOk) {
        return {
          action: "light_correction",
          rationale: `correcting ${firstError.category} error (budget: ${input.correctionsGiven} so far)`,
          correction: {
            original: firstError.original,
            corrected: firstError.corrected,
            explanation: firstError.explanation,
          },
        };
      }

      if (
        input.fluency === "halting" &&
        (!input.policy || input.hintsGiven < input.policy.maxHints)
      ) {
        return {
          action: "provide_hint",
          rationale: "student fluency is halting; scaffold with a hint",
        };
      }

      return { action: "continue_conversation", rationale: "no intervention warranted" };
    },
  };
}

/** Mock: same rules - the decision logic itself is the thing under test. */
export function createMockTeachingInterventionSkill(): SkillDefinition<
  TeachingInterventionInput,
  TeachingInterventionOutput
> {
  return { ...createTeachingInterventionSkill() };
}

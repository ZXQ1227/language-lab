// TeachingIntervention - the deterministic teaching decision.
// Rules only (no LLM) per blueprint: correction policy must be predictable
// and tunable, never left to model whim.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import {
  teachingActionSchema,
  teachingPolicySchema,
  diagnosedErrorSchema,
  interventionStateSchema,
  interventionReasonSchema,
  decideTeachingIntervention,
} from "@language-lab/core";

const inputSchema = z.object({
  errors: z.array(diagnosedErrorSchema).max(5),
  fluency: z.enum(["fluent", "hesitant", "halting", "not_assessed"]),
  hintsGiven: z.number().int().nonnegative(),
  correctionsGiven: z.number().int().nonnegative(),
  allObjectivesCompleted: z.boolean(),
  /** Total objectives; 0 means the lesson has none (free conversation). */
  objectiveCount: z.number().int().nonnegative(),
  policy: teachingPolicySchema.optional(),
  history: interventionStateSchema.optional(),
});

const outputSchema = z.object({
  action: teachingActionSchema,
  rationale: z.string(),
  reason: interventionReasonSchema,
  correction: diagnosedErrorSchema.optional(),
});

export type TeachingInterventionInput = z.infer<typeof inputSchema>;
export type TeachingInterventionOutput = z.infer<typeof outputSchema>;

export function createTeachingInterventionSkill(): SkillDefinition<
  TeachingInterventionInput,
  TeachingInterventionOutput
> {
  return {
    id: "skills.teaching_intervention",
    version: "0.2.0",
    description:
      "Selects one brief correction with practice spacing, repeat suppression and explicit policy reasons.",
    inputSchema,
    outputSchema,
    async execute(input) {
      return decideTeachingIntervention(input);
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

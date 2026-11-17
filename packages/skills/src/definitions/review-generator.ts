// ReviewGenerator: deterministic follow-up practice from validated lesson evidence.
import { z } from "zod";
import {
  evidenceMessageSchema,
  errorDiagnosisRecordSchema,
  lessonStateSchema,
  reviewPlanSchema,
  generateReviewPlan,
  type ReviewPlan,
} from "@language-lab/core";
import type { SkillDefinition } from "../contract";

export const reviewGeneratorInputSchema = z.object({
  state: lessonStateSchema.refine(
    (state) => state.phase === "done" && !!state.courseTemplate,
    "Review needs a completed course snapshot",
  ),
  messages: z.array(evidenceMessageSchema).min(1).max(201),
  diagnoses: z.array(errorDiagnosisRecordSchema).max(100).optional(),
  generatedAt: z.number().int().nonnegative(),
});
export type ReviewGeneratorInput = z.infer<typeof reviewGeneratorInputSchema>;
export type ReviewGeneratorOutput = ReviewPlan;

export function createReviewGeneratorSkill(): SkillDefinition<ReviewGeneratorInput, ReviewPlan> {
  return {
    id: "skills.review_generator",
    version: "0.2.0",
    description:
      "Creates source-linked retrieval, vocabulary and transfer practice without model calls.",
    inputSchema: reviewGeneratorInputSchema,
    outputSchema: reviewPlanSchema,
    async execute(input) {
      return generateReviewPlan(input, input.generatedAt);
    },
  };
}

export const createMockReviewGeneratorSkill = createReviewGeneratorSkill;

// ReviewGenerator - produces spaced-review tasks after a lesson.
// Rule-based composition on top of diagnosis/vocabulary observations.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { SkillContext } from "../context";

const inputSchema = z.object({
  errors: z.array(
    z.object({
      category: z.string(),
      corrected: z.string(),
      explanation: z.string().optional(),
    }),
  ),
  vocabularyMissed: z.array(z.string()),
  studentLevel: z.string(),
});

const outputSchema = z.object({
  tasks: z.array(
    z.object({
      type: z.enum(["error_practice", "vocabulary_drill"]),
      payload: z.record(z.string(), z.unknown()),
      dueInDays: z.number().int().min(1).max(30),
    }),
  ),
});

export type ReviewGeneratorInput = z.infer<typeof inputSchema>;
export type ReviewGeneratorOutput = z.infer<typeof outputSchema>;

export function createReviewGeneratorSkill(): SkillDefinition<
  ReviewGeneratorInput,
  ReviewGeneratorOutput
> {
  return {
    id: "skills.review_generator",
    version: "0.1.0",
    description: "Generates review tasks from lesson errors and missed vocabulary.",
    inputSchema,
    outputSchema,
    async execute(input, _context: SkillContext) {
      const tasks: ReviewGeneratorOutput["tasks"] = [];
      // Dedupe errors by corrected form.
      const seen = new Set<string>();
      for (const error of input.errors) {
        if (seen.has(error.corrected)) continue;
        seen.add(error.corrected);
        tasks.push({
          type: "error_practice",
          payload: {
            category: error.category,
            corrected: error.corrected,
            explanation: error.explanation ?? null,
          },
          dueInDays: 1,
        });
      }
      for (const word of [...new Set(input.vocabularyMissed)].slice(0, 5)) {
        tasks.push({
          type: "vocabulary_drill",
          payload: { word },
          dueInDays: 2,
        });
      }
      return { tasks };
    },
  };
}

/** Mock: same rules - deterministic by construction. */
export function createMockReviewGeneratorSkill(): SkillDefinition<
  ReviewGeneratorInput,
  ReviewGeneratorOutput
> {
  return { ...createReviewGeneratorSkill() };
}

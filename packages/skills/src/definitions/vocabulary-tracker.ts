// Deterministic lexical observations. Never calls a model or awards mastery.

import { z } from "zod";
import {
  normalizeVocabularyForm,
  trackVocabulary,
  vocabularyFormsSchema,
  vocabularyMatchSchema,
} from "@language-lab/core";
import type { SkillDefinition } from "../contract";

const inputSchema = z
  .object({
    utterance: z
      .string()
      .min(1)
      .max(4000)
      .refine((value) => !!value.trim(), "Enter a nonempty practice reply"),
    targetVocabulary: z.array(z.string().trim().min(1)),
    vocabularyForms: z.array(vocabularyFormsSchema).optional(),
  })
  .superRefine((input, ctx) => {
    const targets = new Set(input.targetVocabulary.map(normalizeVocabularyForm));
    if (targets.has(""))
      ctx.addIssue({ code: "custom", message: "Target terms must contain matchable text" });
    const owners = new Map(
      input.targetVocabulary.map((term) => [
        normalizeVocabularyForm(term),
        normalizeVocabularyForm(term),
      ]),
    );
    for (const item of input.vocabularyForms ?? []) {
      const term = normalizeVocabularyForm(item.term);
      if (!targets.has(term))
        ctx.addIssue({ code: "custom", message: "Vocabulary forms must reference a target term" });
      for (const form of item.forms) {
        const key = normalizeVocabularyForm(form);
        if (!key || (owners.has(key) && owners.get(key) !== term))
          ctx.addIssue({
            code: "custom",
            message: "Vocabulary forms must be nonempty and unambiguous",
          });
        owners.set(key, term);
      }
    }
  });

const outputSchema = z.object({
  used: z.array(z.string()),
  missed: z.array(z.string()),
  matches: z.array(vocabularyMatchSchema),
});

export type VocabularyTrackerInput = z.infer<typeof inputSchema>;
export type VocabularyTrackerOutput = z.infer<typeof outputSchema>;

export function createVocabularyTrackerSkill(): SkillDefinition<
  VocabularyTrackerInput,
  VocabularyTrackerOutput
> {
  return {
    id: "skills.vocabulary_tracker",
    version: "0.2.0",
    description:
      "Observes exact target words and authored forms with Unicode-aware boundaries and original-text evidence.",
    inputSchema,
    outputSchema,
    async execute(input) {
      return trackVocabulary(input.utterance, input.targetVocabulary, input.vocabularyForms);
    },
  };
}

/** Mock: same rules - kept separate so tests can swap it without behavior change. */
export function createMockVocabularyTrackerSkill(): SkillDefinition<
  VocabularyTrackerInput,
  VocabularyTrackerOutput
> {
  return { ...createVocabularyTrackerSkill() };
}

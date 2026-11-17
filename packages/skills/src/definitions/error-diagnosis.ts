// ErrorDiagnosis - identifies language errors in the student utterance.
// LLM-based with a structured output schema; the mock variant is rule-based
// on a known marker sentence so tests stay deterministic.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { SkillContext } from "../context";

const errorItemSchema = z.object({
  category: z.enum(["grammar", "vocabulary", "collocation", "tense", "article", "spelling"]),
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
});

const inputSchema = z.object({
  utterance: z.string().min(1),
  studentLevel: z.string(),
});

const outputSchema = z.object({
  errors: z.array(errorItemSchema),
  fluency: z.enum(["fluent", "hesitant", "halting"]),
  intent: z.string(),
});

export type ErrorDiagnosisInput = z.infer<typeof inputSchema>;
export type ErrorDiagnosisOutput = z.infer<typeof outputSchema>;
export type DiagnosedError = z.infer<typeof errorItemSchema>;

export function createErrorDiagnosisSkill(): SkillDefinition<
  ErrorDiagnosisInput,
  ErrorDiagnosisOutput
> {
  return {
    id: "skills.error_diagnosis",
    version: "0.1.0",
    description: "Diagnoses language errors, fluency and intent in the student utterance.",
    inputSchema,
    outputSchema,
    async execute(input, context: SkillContext) {
      const result = await context.modelGateway.llm.generateStructured(
        {
          messages: [
            {
              role: "system",
              content: [
                "You are a language teacher diagnosing a student utterance.",
                `Student level: ${input.studentLevel}.`,
                "List only real errors (be conservative; do not invent corrections).",
                "Classify overall intent in one short phrase (e.g. 'book a room').",
              ].join(" "),
            },
            { role: "user", content: input.utterance },
          ],
        },
        outputSchema,
      );
      return result.data;
    },
  };
}

/**
 * Mock: deterministic rule check on a couple of common error patterns,
 * plus the canonical "I go ... yesterday" tense marker used in tests.
 */
export function createMockErrorDiagnosisSkill(): SkillDefinition<
  ErrorDiagnosisInput,
  ErrorDiagnosisOutput
> {
  return {
    ...createErrorDiagnosisSkill(),
    async execute(input) {
      const errors: DiagnosedError[] = [];
      if (
        /\bI go\b/i.test(input.utterance) &&
        /yesterday|last (week|night|month)/i.test(input.utterance)
      ) {
        errors.push({
          category: "tense",
          original: "I go",
          corrected: "I went",
          explanation: "Past time expressions require the past tense.",
        });
      }
      if (/\bI am agree\b/i.test(input.utterance)) {
        errors.push({
          category: "grammar",
          original: "I am agree",
          corrected: "I agree",
          explanation: "'Agree' is a verb, not an adjective.",
        });
      }
      return {
        errors,
        fluency: errors.length > 1 ? "halting" : errors.length === 1 ? "hesitant" : "fluent",
        intent: "mock: continue conversation",
      };
    },
  };
}

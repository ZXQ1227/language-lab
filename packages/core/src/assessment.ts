import { z } from "zod";
import type { CourseStage } from "./scenario";

export const speechInputSchema = z.object({
  providerId: z.string().trim().min(1).max(200),
  language: z.string().regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/),
  edited: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
});
export type SpeechInput = z.infer<typeof speechInputSchema>;
export const evidenceMessageSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().min(1),
    purpose: z.literal("support").optional(),
    speech: speechInputSchema.optional(),
  })
  .refine(
    (message) => !message.speech || message.role === "user",
    "Only learner messages may carry speech input metadata",
  );
export type EvidenceMessage = z.infer<typeof evidenceMessageSchema>;

export const stageAssessmentSchema = z.strictObject({
  stageId: z.string().min(1),
  criteria: z
    .array(
      z.strictObject({
        criterionIndex: z.number().int().nonnegative(),
        met: z.boolean(),
        evidence: z.array(
          z.strictObject({
            messageSeq: z.number().int().nonnegative(),
            quote: z.string().trim().min(1),
          }),
        ),
      }),
    )
    .min(1),
  feedback: z.string().trim().min(1),
});
export type StageAssessment = z.infer<typeof stageAssessmentSchema>;

/** Verify citations deterministically before accepting a model's judgment. */
export function validateStageAssessment(
  raw: unknown,
  stage: CourseStage,
  transcript: readonly EvidenceMessage[],
): StageAssessment {
  const assessment = stageAssessmentSchema.parse(raw);
  if (assessment.stageId !== stage.id) throw new Error("Assessment refers to a different stage");
  const indexes = new Set(assessment.criteria.map((criterion) => criterion.criterionIndex));
  if (
    assessment.criteria.length !== stage.successCriteria.length ||
    indexes.size !== stage.successCriteria.length ||
    [...indexes].some((index) => index >= stage.successCriteria.length)
  ) {
    throw new Error("Assessment must cover each stage criterion exactly once");
  }
  const messages = new Map(transcript.map((message) => [message.seq, message]));
  if (messages.size !== transcript.length) throw new Error("Duplicate transcript message sequence");
  for (const criterion of assessment.criteria) {
    if (criterion.met && criterion.evidence.length === 0)
      throw new Error("Completed criterion needs learner evidence");
    for (const citation of criterion.evidence) {
      const message = messages.get(citation.messageSeq);
      if (
        !message ||
        message.role !== "user" ||
        message.purpose === "support" ||
        !message.content.includes(citation.quote)
      ) {
        throw new Error("Assessment citation must quote an existing learner message exactly");
      }
    }
  }
  return assessment;
}

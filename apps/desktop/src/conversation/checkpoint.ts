import { z } from "zod";
import {
  errorDiagnosisSchema,
  trackVocabulary,
  validateDiagnosedErrors,
  type EvidenceMessage,
} from "@language-lab/core";
import { lessonMemoryContributionSchema } from "@language-lab/memory";
import { projectPracticeEvidence } from "../training/learningMemory";
import {
  speakingMemory,
  speakingPracticeSchema,
  validateSpeakingPractice,
} from "../practice/records";

export const freeConversationGreeting = "Hey, What’s on your mind today?";
export const freeConversationMessageLimit = 4000;

export const freeConversationVocabularySchema = z.array(z.string().trim().min(1).max(80)).max(6);
const turnSchema = z
  .strictObject({
    utterance: z.string().trim().min(1).max(freeConversationMessageLimit),
    reply: z.string().trim().min(1).max(1600),
    purpose: z.literal("support").optional(),
    vocabulary: freeConversationVocabularySchema,
    diagnosis: errorDiagnosisSchema.optional(),
  })
  .superRefine((turn, ctx) => {
    if (turn.purpose === "support" && (turn.vocabulary.length || turn.diagnosis)) {
      ctx.addIssue({
        code: "custom",
        message: "Help exchanges cannot contribute practice evidence",
      });
    }
    if (trackVocabulary(turn.utterance, turn.vocabulary).used.length !== turn.vocabulary.length) {
      ctx.addIssue({ code: "custom", message: "Vocabulary must match the learner’s exact reply" });
    }
    if (turn.diagnosis) {
      try {
        validateDiagnosedErrors(turn.utterance, turn.diagnosis.errors);
      } catch {
        ctx.addIssue({ code: "custom", message: "Diagnosis must match the learner’s exact reply" });
      }
    }
  });

export const freeConversationCheckpointSchema = z
  .strictObject({
    version: z.literal(1),
    id: z.templateLiteral(["free-", z.uuid()]),
    updatedAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
    turns: z.array(turnSchema).min(1),
    speakingPractice: speakingPracticeSchema.optional(),
  })
  .superRefine((checkpoint, ctx) => {
    if (
      !validateSpeakingPractice(checkpoint.speakingPractice, checkpoint.turns.length * 2, (seq) => {
        const turn = checkpoint.turns[(seq - 1) / 2];
        return turn?.purpose ? undefined : turn?.utterance;
      })
    )
      ctx.addIssue({
        code: "custom",
        path: ["speakingPractice"],
        message: "Invalid speaking practice evidence",
      });
  });

export type FreeConversationCheckpoint = z.infer<typeof freeConversationCheckpointSchema>;
export type FreeConversationTurn = z.infer<typeof turnSchema>;
export type FreeConversationMessage = { role: "assistant" | "user"; content: string };

export function conversationMessages(
  turns: readonly FreeConversationTurn[],
): FreeConversationMessage[] {
  const messages: FreeConversationMessage[] = [
    { role: "assistant", content: freeConversationGreeting },
  ];
  for (const turn of turns)
    messages.push(
      { role: "user", content: turn.utterance },
      { role: "assistant", content: turn.reply },
    );
  return messages;
}

export function buildFreeConversationContribution(checkpoint: FreeConversationCheckpoint) {
  const messages: EvidenceMessage[] = checkpoint.turns.map((turn, index) => ({
    seq: index * 2 + 1,
    role: "user",
    content: turn.utterance,
    ...(turn.purpose ? { purpose: turn.purpose } : {}),
  }));
  const diagnoses = checkpoint.turns.flatMap((turn, index) =>
    turn.diagnosis ? [{ messageSeq: index * 2 + 1, diagnosis: turn.diagnosis }] : [],
  );
  return lessonMemoryContributionSchema.parse({
    version: 1,
    source: "free-conversation",
    lessonId: checkpoint.id,
    title: "Free conversation",
    language: "en",
    difficulty: "unspecified",
    mode: "ai",
    updatedAt: checkpoint.updatedAt,
    totalTurns: checkpoint.turns.length,
    completed: false,
    objectivesCompleted: 0,
    objectiveCount: 0,
    speakingPractice: speakingMemory(checkpoint.speakingPractice),
    ...projectPracticeEvidence(
      checkpoint.turns.flatMap((turn) => turn.vocabulary),
      messages,
      diagnoses,
    ),
  });
}

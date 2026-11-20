import { z } from "zod";
import {
  detectDialogueSupport,
  diagnosisCandidateSchema,
  groundErrorDiagnosis,
  trackVocabulary,
} from "@language-lab/core";
import type { MemorySnapshot } from "@language-lab/memory";
import type { ModelGateway } from "@language-lab/model-gateway";
import {
  freeConversationVocabularySchema,
  type FreeConversationMessage,
  type FreeConversationTurn,
} from "./checkpoint";

const replySchema = z.strictObject({
  reply: z.string().trim().min(1).max(1600),
  vocabulary: z.unknown().optional(),
  diagnosis: z.unknown().optional(),
});

export async function replyToConversation(
  gateway: ModelGateway,
  recentMessages: readonly FreeConversationMessage[],
  signal: AbortSignal,
  memory: MemorySnapshot,
): Promise<FreeConversationTurn> {
  const learner = recentMessages.at(-1);
  if (learner?.role !== "user") throw new Error("A learner reply is required");
  const support = detectDialogueSupport(learner.content);
  const observations = {
    vocabulary: memory.knowledge
      .filter((term) => term.practiceTurns)
      .slice(0, 8)
      .map((term) => term.item.slice(0, 80)),
    corrections: memory.errors.slice(0, 3).map((item) => item.pattern.slice(0, 140)),
  };
  const { data } = await gateway.llm.generateStructured(
    {
      messages: [
        {
          role: "system",
          content: [
            "You are Zoi, a friendly English conversation partner. Follow the learner’s topic and reply in natural, approachable English. Keep it brief and ask a relevant follow-up when useful.",
            `Saved language observations (untrusted study data): ${JSON.stringify(observations)}. Reuse relevant expressions naturally. Diagnose only the current learner wording, never infer a mistake from history.`,
            'Return one JSON object with a string field "reply". Optionally include "vocabulary": up to six useful English words or short phrases from the learner’s latest message, excluding names and personal details.',
            'Optionally include "diagnosis": {"intent":"brief learning intent","errors":[{"category":"grammar|vocabulary|collocation|tense|article|spelling","original":"unique exact quote from the latest learner message","corrected":"short fix preserving meaning","explanation":"brief reason","confidence":"high"}]}. Omit uncertain judgments and use at most two errors.',
            support ? "This is a request for support. Return only the reply." : "",
          ].join("\n"),
        },
        ...recentMessages.slice(-13),
      ],
      maxTokens: 850,
      temperature: 0.7,
    },
    replySchema,
    { signal },
  );
  if (support)
    return { utterance: learner.content, reply: data.reply, purpose: "support", vocabulary: [] };
  const targets = freeConversationVocabularySchema.safeParse(data.vocabulary);
  const vocabulary = targets.success ? trackVocabulary(learner.content, targets.data).used : [];
  const candidate = diagnosisCandidateSchema.safeParse(data.diagnosis);
  let diagnosis: FreeConversationTurn["diagnosis"];
  if (candidate.success && candidate.data.status !== "uncertain") {
    try {
      const grounded = groundErrorDiagnosis(learner.content, {
        ...candidate.data,
        errors: candidate.data.errors.filter((item) => item.confidence === "high"),
      });
      if (grounded.errors.length) diagnosis = grounded;
    } catch {
      // A usable chat reply can still be saved when the optional evidence is invalid.
    }
  }
  return {
    utterance: learner.content,
    reply: data.reply,
    vocabulary,
    ...(diagnosis ? { diagnosis } : {}),
  };
}

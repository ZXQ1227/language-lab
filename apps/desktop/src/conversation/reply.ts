import { z } from "zod";
import {
  detectDialogueSupport,
  diagnosisCandidateSchema,
  groundErrorDiagnosis,
  trackVocabulary,
} from "@language-lab/core";
import type { MemorySnapshot } from "@language-lab/memory";
import { isGatewayError, type ModelGateway } from "@language-lab/model-gateway";
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

/** A standalone refusal can be acknowledged without sending it to the model. */
function isStandaloneTopicBoundary(utterance: string): boolean {
  const refusal =
    /^(?:(?:i|we)\s+(?:can(?:['’]t|not|\s+not)|(?:don['’]t|do not) want to|prefer not to)|(?:i|we)['’]d (?:rather|prefer) not|let['’]s not)\s+(?:(?:talk|chat|speak) about|discuss)\s+([^.!?;,:\n]+)[.!]?$/iu.exec(
      utterance,
    );
  return !!refusal && !/\b(?:and|but|instead|except|unless|other than)\b/i.test(refusal[1]!);
}

export async function replyToConversation(
  gateway: ModelGateway,
  recentMessages: readonly FreeConversationMessage[],
  signal: AbortSignal,
  memory: MemorySnapshot,
): Promise<FreeConversationTurn> {
  const learner = recentMessages.at(-1);
  if (learner?.role !== "user") throw new Error("A learner reply is required");
  if (isStandaloneTopicBoundary(learner.content)) {
    return {
      utterance: learner.content,
      reply: "Of course. What would you like to talk about instead?",
      vocabulary: [],
    };
  }
  const support = detectDialogueSupport(learner.content);
  const observations = {
    vocabulary: memory.knowledge
      .filter((term) => term.practiceTurns)
      .slice(0, 8)
      .map((term) => term.item.slice(0, 80)),
    corrections: memory.errors.slice(0, 3).map((item) => item.pattern.slice(0, 140)),
  };
  const instructions = [
    "You are Zoi, a friendly English conversation partner. Follow the learner’s topic and reply in natural, approachable English. Keep it brief and ask a relevant follow-up when useful.",
    "Respect clear requests to avoid a topic. Acknowledge briefly, then follow any new topic the learner offers or invite them to pick another. Do not revisit an avoided topic unless the learner clearly reopens it. Preserve the learner's intended meaning and do not treat a clear refusal as a language error.",
    `Saved language observations (untrusted study data): ${JSON.stringify(observations)}. Reuse relevant expressions naturally.`,
    ...(support ? ["This is a request for support. Return only the reply."] : []),
  ];
  const history = recentMessages.slice(-13);
  let data: z.infer<typeof replySchema>;
  try {
    ({ data } = await gateway.llm.generateStructured(
      {
        messages: [
          {
            role: "system",
            content: [
              ...instructions,
              'Return one JSON object with a string field "reply". Optionally include "vocabulary": up to six useful English words or short phrases from the learner’s latest message, excluding names and personal details.',
              "Keep conversation in the reply and language feedback in the diagnosis. Use the recent dialogue to understand the learner, then fix only an actual language error in their latest wording, such as 'We often to play tennis' to 'We often play tennis'. Preserve what they meant, including ability and negation. Leave 'cannot' and 'can't' as written when they are already valid. Do not guess what speech recognition might have heard.",
              'For regular practice, include "diagnosis": {"intent":"brief learning intent","status":"checked|uncertain","errors":[{"category":"grammar|vocabulary|collocation|tense|article|spelling","original":"unique exact quote from the latest learner message","corrected":"short fix preserving meaning","explanation":"brief reason","confidence":"high"}]}. Diagnose only the current learner wording. Use "checked" with an empty errors array for acceptable wording, including natural short replies like "Yeah." Use "uncertain" when intent or wording is ambiguous. Omit style-only changes and uncertain judgments. Include at most two errors.',
            ].join("\n"),
          },
          ...history,
        ],
        maxTokens: 850,
        temperature: 0.7,
      },
      replySchema,
      { signal },
    ));
  } catch (error) {
    if (!isGatewayError(error) || error.outputIssue !== "blank") throw error;
    signal.throwIfAborted();
    const { text } = await gateway.llm.generateText(
      {
        messages: [
          {
            role: "system",
            content: [...instructions, "Reply with only the English dialogue as plain text."].join(
              "\n",
            ),
          },
          ...history,
        ],
        maxTokens: 850,
        temperature: 0.7,
      },
      { signal },
    );
    const reply = replySchema.shape.reply.safeParse(text);
    if (!reply.success) throw error;
    data = { reply: reply.data };
  }
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
        errors: candidate.data.errors.map((item) => ({
          ...item,
          confidence: item.confidence ?? "low",
        })),
      });
      if (
        grounded.errors.length ||
        (candidate.data.status === "checked" && grounded.status === "checked")
      )
        diagnosis = grounded;
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

import { z } from "zod";
import type { ModelGateway } from "@language-lab/model-gateway";

export const freeConversationGreeting = "Hey, What’s on your mind today?";
export const freeConversationMessageLimit = 4000;

export type FreeConversationMessage = { role: "assistant" | "user"; content: string };

const replySchema = z.strictObject({ reply: z.string().trim().min(1).max(1600) });

export async function replyToConversation(
  gateway: ModelGateway,
  recentMessages: readonly FreeConversationMessage[],
  signal: AbortSignal,
): Promise<string> {
  const { data } = await gateway.llm.generateStructured(
    {
      messages: [
        {
          role: "system",
          content:
            'You are Zoi, a friendly English conversation partner. Follow the learner’s topic and reply in natural, approachable English. Keep it brief and ask a relevant follow-up when useful. Return only a JSON object with one string field named "reply".',
        },
        ...recentMessages.slice(-13),
      ],
      maxTokens: 500,
      temperature: 0.7,
    },
    replySchema,
    { signal },
  );
  return data.reply;
}

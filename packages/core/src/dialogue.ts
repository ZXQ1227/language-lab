import { z } from "zod";
import type { EvidenceMessage } from "./assessment";

const text = z.string().trim().min(1);
export const roleplayCharacterSchema = z.strictObject({
  name: text.max(60),
  traits: z.array(text.max(80)).min(1).max(5),
  speakingStyle: text.max(300),
  motivation: text.max(300),
  boundaries: z.array(text.max(200)).max(8),
});
export const dialogueSupportSchema = z.enum(["repeat", "simplify", "hint"]);
export type DialogueSupport = z.infer<typeof dialogueSupportSchema>;
/** Only standalone control phrases match; scene-specific questions stay practice. */
export function detectDialogueSupport(utterance: string): DialogueSupport | undefined {
  const text = utterance
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  const prefix = "(?:(?:could|can|would) you )?(?:please )?";
  const suffix = "(?: please)?";
  if (
    new RegExp(
      `^${prefix}(?:repeat (?:that|it|your last (?:reply|message))|say that again)${suffix}$`,
    ).test(text)
  )
    return "repeat";
  if (
    new RegExp(
      `^${prefix}(?:say that in simpler english|use simpler english|make that simpler)${suffix}$`,
    ).test(text)
  )
    return "simplify";
  if (new RegExp(`^${prefix}(?:give me (?:a|one) hint)${suffix}$`).test(text)) return "hint";
  return undefined;
}
export const dialogueMoveSchema = z.enum([
  "respond",
  "follow_up",
  "clarify",
  "redirect",
  "close",
  "repeat",
  "simplify",
  "hint",
]);
export type DialogueMove = z.infer<typeof dialogueMoveSchema>;

/** Quoted learner statements, never authoritative scenario facts. */
export const dialogueMemoryItemSchema = z.strictObject({
  id: text.max(40).regex(/^[a-z0-9-]+$/),
  messageSeq: z.number().int().nonnegative(),
  quote: text.max(300),
});
export const dialogueMemorySchema = z
  .array(dialogueMemoryItemSchema)
  .max(12)
  .superRefine((items, ctx) => {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      ctx.addIssue({ code: "custom", message: "Dialogue memory ids must be unique" });
  });
export type DialogueMemoryItem = z.infer<typeof dialogueMemoryItemSchema>;

export function validateDialogueMemory(
  items: readonly DialogueMemoryItem[],
  transcript: readonly EvidenceMessage[],
): void {
  for (const item of items) {
    const message = transcript.find((entry) => entry.seq === item.messageSeq);
    if (
      !message ||
      message.role !== "user" ||
      message.purpose === "support" ||
      !message.content.includes(item.quote)
    ) {
      throw new Error("Dialogue memory must quote an existing learner practice message exactly");
    }
    if (message.content.trim().length <= 300 && item.quote !== message.content.trim())
      throw new Error(
        "Dialogue memory must preserve the complete short learner message, including qualifications",
      );
  }
}

export function mergeDialogueMemory(
  previous: readonly DialogueMemoryItem[],
  updates: readonly DialogueMemoryItem[],
  transcript: readonly EvidenceMessage[],
): DialogueMemoryItem[] {
  const parsed = dialogueMemorySchema.parse(updates);
  validateDialogueMemory(parsed, transcript);
  const result = new Map(previous.map((item) => [item.id, item]));
  for (const update of parsed) {
    if ((result.get(update.id)?.messageSeq ?? -1) > update.messageSeq)
      throw new Error("Dialogue memory cannot replace a newer learner statement with an older one");
    result.set(update.id, update);
  }
  return [...result.values()].sort((a, b) => a.messageSeq - b.messageSeq).slice(-12);
}

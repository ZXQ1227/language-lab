import { z } from "zod";
import { learnerPracticeText, type EvidenceMessage } from "./assessment";

const text = z.string().trim().min(1);
export const voiceStyleSchema = z.enum(["female", "male"]);
export type VoiceStyle = z.infer<typeof voiceStyleSchema>;

export const roleplayCharacterSchema = z.strictObject({
  name: text.max(60),
  voiceStyle: voiceStyleSchema.optional(),
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
    .replace(/,\s*(?=please$)/u, " ")
    .replace(/\s+/g, " ");
  const prefix = "(?:(?:could|can|would) you )?(?:please )?";
  const suffix = "(?: please)?";
  if (
    /^(?:请|請)?(?:(?:能|可以)再说一遍吗|(?:能|可以)再說一遍嗎|再说一遍|再說一遍)[？。]*$/u.test(
      text,
    )
  )
    return "repeat";
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

export const turnEvidenceStatusSchema = z.enum(["off_topic", "unclear", "unavailable"]);
export type TurnEvidenceStatus = z.infer<typeof turnEvidenceStatusSchema>;

/** Scope deterministic routing to clear controls and recognition placeholders. */
export function classifyTeachingInput(
  utterance: string,
  mode: "text" | "voice",
): {
  support?: DialogueSupport;
  mixedSupport?: DialogueSupport;
  practiceStart?: number;
  evidenceStatus?: "off_topic" | "unclear";
} {
  const text = utterance.trim();
  const support = detectDialogueSupport(text);
  if (support) return { support };

  let mixed: { mixedSupport: DialogueSupport; practiceStart: number } | undefined;
  for (const delimiter of text.matchAll(/[.!?。！？,，;；]+\s*|\s+(?:and|but)\s+/giu)) {
    if (delimiter.index > 120) break;
    const answerStart = delimiter.index + delimiter[0].length;
    if (answerStart === text.length || /^please(?:[.!?]|$)/iu.test(text.slice(answerStart)))
      continue;
    const mixedSupport = detectDialogueSupport(text.slice(0, delimiter.index));
    if (mixedSupport) {
      mixed = { mixedSupport, practiceStart: answerStart };
      break;
    }
  }
  const candidate = text.slice(mixed?.practiceStart ?? 0);

  if (
    !/[\p{L}\p{N}]/u.test(candidate) ||
    (mode === "voice" &&
      /^(?:[\s.,!?-]*(?:\[(?:inaudible|unintelligible|noise|silence)\]|\b(?:um+|uh+|erm+)\b))*[\s.,!?-]*$/iu.test(
        candidate,
      ))
  ) {
    return { evidenceStatus: "unclear" as const };
  }
  if (
    /^(?:please\s+)?(?:mark|set)\s+(?:(?:all|my|the|this|of)\s+)*(?:objectives?|goals?|lesson|stage|course)\s+(?:as\s+)?(?:completed?|done|passed)[.!?]*$/iu.test(
      candidate,
    )
  )
    return { evidenceStatus: "off_topic" as const };
  return mixed ?? {};
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
    const practice = message && learnerPracticeText(message);
    if (!practice?.includes(item.quote)) {
      throw new Error("Dialogue memory must quote an existing learner practice message exactly");
    }
    if (practice.trim().length <= 300 && item.quote !== practice.trim())
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

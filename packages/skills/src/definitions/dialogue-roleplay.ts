// DialogueRoleplay - generates the tutor/scenario-character reply.
// LLM-based; the teaching decision arrives as a pre-computed intervention
// directive, keeping "decide" and "speak" separated per blueprint.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { MessageRole, SkillContext } from "../context";
import { courseStageSchema, type TeachingAction } from "@language-lab/core";

const messageSchema = z.object({
  seq: z.number(),
  role: z.enum(["user", "assistant", "system"]) satisfies z.ZodType<MessageRole>,
  content: z.string(),
});

const inputSchema = z.object({
  roleCard: z.object({
    persona: z.string(),
    setting: z.string(),
  }),
  utterance: z.string().min(1),
  intervention: z.object({
    action: z.enum([
      "continue_conversation",
      "light_correction",
      "provide_hint",
      "change_difficulty",
      "complete_task",
    ]) satisfies z.ZodType<TeachingAction>,
    note: z.string().optional(),
  }),
  recentMessages: z.array(messageSchema).max(20),
  course: z
    .object({
      targetLanguage: z.string().min(1),
      learnerRole: z.string().min(1),
      difficulty: z.string().min(1),
      targetVocabulary: z.array(z.string()),
      targetPatterns: z.array(z.object({ pattern: z.string(), example: z.string() })),
      stage: courseStageSchema.optional(),
      allowHints: z.boolean(),
    })
    .optional(),
});

const outputSchema = z.object({
  reply: z.string().min(1),
  tone: z.enum(["encouraging", "neutral", "corrective"]),
});

export type DialogueRoleplayInput = z.infer<typeof inputSchema>;
export type DialogueRoleplayOutput = z.infer<typeof outputSchema>;

const ACTION_DIRECTIVES: Record<DialogueRoleplayInput["intervention"]["action"], string> = {
  continue_conversation: "Continue the roleplay naturally; do not correct anything.",
  light_correction: "Briefly acknowledge the correction, then continue the roleplay.",
  provide_hint: "Give the student a gentle hint without giving the full answer.",
  change_difficulty: "Adapt your language to the new difficulty level.",
  complete_task: "Wrap up this task warmly and confirm the objective is met.",
};

export function createDialogueRoleplaySkill(): SkillDefinition<
  DialogueRoleplayInput,
  DialogueRoleplayOutput
> {
  return {
    id: "skills.dialogue_roleplay",
    version: "0.1.0",
    description: "Generates the in-character reply for the current teaching decision.",
    inputSchema,
    outputSchema,
    async execute(input, context: SkillContext) {
      const system = [
        `You are ${input.roleCard.persona} in the setting: ${input.roleCard.setting}.`,
        `Student level: ${input.course?.difficulty ?? context.studentProfile.level} ${input.course?.targetLanguage ?? context.studentProfile.targetLanguage}.`,
        "Stay in character. Reply in the target language. Keep replies short (1-3 sentences).",
        ...(input.course
          ? [
              `The learner plays: ${input.course.learnerRole}.`,
              `Practise vocabulary: ${input.course.targetVocabulary.join(", ")}.`,
              `Target expressions: ${input.course.targetPatterns.map((item) => `${item.pattern} (example: ${item.example})`).join("; ")}.`,
              input.course.stage
                ? `Current stage: ${input.course.stage.title}. ${input.course.stage.instruction}\nSuccess criteria: ${input.course.stage.successCriteria.join("; ")}.`
                : "All course stages have been completed; wrap up the roleplay.",
              input.course.allowHints && input.course.stage
                ? `Available scaffolding: ${input.course.stage.hints.join("; ")}. Use only when asked to provide a hint.`
                : "Do not provide additional hints; the lesson hint budget is exhausted.",
              "Do not claim an objective is completed without evidence from the learner.",
            ]
          : []),
        `Directive: ${ACTION_DIRECTIVES[input.intervention.action]}`,
        input.intervention.note ? `Additional note: ${input.intervention.note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const result = await context.modelGateway.llm.generateStructured(
        {
          messages: [
            { role: "system", content: system },
            ...input.recentMessages.map((m) => ({
              role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: m.content,
            })),
            { role: "user", content: input.utterance },
          ],
        },
        outputSchema,
      );
      return result.data;
    },
  };
}

/** Deterministic mock: echoes the intervention without any model call. */
export function createMockDialogueRoleplaySkill(): SkillDefinition<
  DialogueRoleplayInput,
  DialogueRoleplayOutput
> {
  return {
    ...createDialogueRoleplaySkill(),
    async execute(input) {
      const openers: Record<DialogueRoleplayInput["intervention"]["action"], string> = {
        continue_conversation: "Great, let's keep going.",
        light_correction: "Good try - small fix noted, let's continue.",
        provide_hint: "Here's a hint to help you along.",
        change_difficulty: "Let me adjust the level for you.",
        complete_task: "Nice work, that task is complete!",
      };
      return {
        reply: `${openers[input.intervention.action]} [mock reply to: "${input.utterance}"]`,
        tone: input.intervention.action === "light_correction" ? "corrective" : "encouraging",
      };
    },
  };
}

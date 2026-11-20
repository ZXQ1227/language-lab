import { describe, expect, it } from "vitest";
import { createGateway, MockLlmProvider } from "@language-lab/model-gateway";
import { lessonMemoryContributionSchema } from "@language-lab/memory";
import {
  assessSpeaking,
  generateSpeakingHint,
  generateSpeakingTask,
} from "../../../apps/desktop/src/practice/generation";
import {
  replaceSpeakingHint,
  validateSpeakingPractice,
  speakingMemory,
  type SpeakingHintRecord,
} from "../../../apps/desktop/src/practice/records";
import { checkAuthoredSpeaking } from "../../../apps/desktop/src/practice/authored";
import { relatedSpeakingPractice } from "../../../apps/desktop/src/practice/candidates";

const example = "Could I leave my bags until check-in?";
const hint: SpeakingHintRecord = {
  anchorSeq: 0,
  source: "authored",
  authoredId: "hotel-luggage",
  stageId: "ask-services",
  shownAt: 10,
  example,
  intent: "Ask to leave luggage until check-in.",
  answer: { at: 11, messageSeq: 1, assessment: { result: "met", quote: "bags" } },
};

const gateway = (...payloads: object[]) =>
  createGateway({
    llm: new MockLlmProvider(
      {},
      payloads.map((value) => JSON.stringify(value)),
    ),
  });
const signal = new AbortController().signal;

describe("contextual speaking practice", () => {
  it("validates model hints and keeps the transfer answer separate from the situation", async () => {
    const input = {
      language: "en",
      draft: "寄存行李",
      history: [{ role: "assistant" as const, content: "Can I help you with anything else?" }],
    };
    await expect(
      generateSpeakingHint(gateway({ intent: hint.intent, example }), input, signal),
    ).resolves.toEqual({ intent: hint.intent, example });
    await expect(
      generateSpeakingHint(gateway({ intent: hint.intent, example: "" }), input, signal),
    ).rejects.toMatchObject({ kind: "schema_violation" });

    const next = "Could you keep my luggage until four?";
    const task = {
      example: next,
      situation: "You have checked out. Ask the front desk to keep your bags until four.",
      criterion: "Request storage until four.",
    };
    await expect(
      generateSpeakingTask(gateway(task), { language: "en", hint }, signal),
    ).resolves.toEqual(task);
    await expect(
      generateSpeakingTask(gateway({ ...task, situation: next }), { language: "en", hint }, signal),
    ).rejects.toThrow("hidden answer");
  });

  it("accepts grounded equivalent answers and degrades unverifiable output to uncertain", async () => {
    const reply = "Could you hold my suitcase until four?";
    await expect(
      assessSpeaking(
        gateway({ result: "met", quote: "hold my suitcase until four" }),
        hint.intent,
        reply,
      ),
    ).resolves.toEqual({ result: "met", quote: "hold my suitcase until four" });
    await expect(
      assessSpeaking(gateway({ result: "met", quote: "leave my bags" }), hint.intent, reply),
    ).resolves.toEqual({ result: "uncertain" });
    await expect(
      assessSpeaking(gateway({ result: "wrong-format" }), hint.intent, reply),
    ).resolves.toEqual({ result: "uncertain" });
    expect(checkAuthoredSpeaking(hint, reply, true)).toMatchObject({ result: "met" });
    expect(checkAuthoredSpeaking(hint, "Do not keep my suitcase until four.", true)).toEqual({
      result: "uncertain",
    });
    expect(
      checkAuthoredSpeaking(hint, "Could you keep my suitcase until five? I have four bags.", true),
    ).toEqual({ result: "uncertain" });
  });

  it("validates saved references and recommends only eligible existing sources", () => {
    const practice = replaceSpeakingHint(undefined, hint);
    const stages = new Set(["ask-services"]);
    expect(validateSpeakingPractice(practice, 2, () => example, stages)).toBe(true);
    expect(validateSpeakingPractice(practice, 2, () => "Unrelated reply", stages)).toBe(false);
    const source = lessonMemoryContributionSchema.parse({
      version: 1,
      lessonId: "prior",
      language: "en",
      title: "Hotel",
      difficulty: "A2",
      mode: "demo",
      updatedAt: 12,
      totalTurns: 1,
      practiceTurns: 1,
      completed: true,
      objectivesCompleted: 1,
      objectiveCount: 1,
      knowledge: [],
      errors: [],
      speakingPractice: speakingMemory(practice, "travel"),
    });
    const lesson = { id: "current", category: "travel", language: "en", offline: true };
    expect(relatedSpeakingPractice([source], lesson)).toEqual({
      id: "prior",
      anchorSeq: 0,
      at: 11,
    });
    expect(relatedSpeakingPractice([source], { ...lesson, category: "work" })).toBeUndefined();
    expect(relatedSpeakingPractice([], lesson)).toBeUndefined();
  });
});

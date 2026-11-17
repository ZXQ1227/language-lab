import { describe, expect, it } from "vitest";
import {
  createMockVocabularyTrackerSkill,
  createVocabularyTrackerSkill,
  SkillRegistry,
  type SkillContext,
  type VocabularyTrackerOutput,
} from "@language-lab/skills";
import { scenarioContentSchema } from "@language-lab/core";
import hotel from "../../../content/scenarios/hotel-checkin.json";

// No model, data ports or profile exist in this context: the skill must need none.
const context = {} as SkillContext;
const call = (input: unknown, mock = false) => {
  const registry = new SkillRegistry();
  registry.register(mock ? createMockVocabularyTrackerSkill() : createVocabularyTrackerSkill());
  return registry.call<VocabularyTrackerOutput>("skills.vocabulary_tracker", input, context);
};

describe("Vocabulary Tracker boundary", () => {
  it("runs identically offline and connected, preserving offsets in the untrimmed input", async () => {
    const input = {
      utterance: "  ＩＤ and two key cards.",
      targetVocabulary: ["ID", "key card", "deposit"],
      vocabularyForms: [{ term: "key card", forms: ["key cards"] }],
    };
    const real = await call(input);
    expect(await call(input, true)).toEqual(real);
    expect(real.used).toEqual(["ID", "key card"]);
    expect(real.missed).toEqual(["deposit"]);
    expect(real.matches[0]).toMatchObject({ quote: "ＩＤ", start: 2, end: 4 });
  });

  it.each([
    { utterance: " ", targetVocabulary: ["ID"] },
    { utterance: "Hi", targetVocabulary: [""] },
    {
      utterance: "Hi",
      targetVocabulary: ["ID"],
      vocabularyForms: [{ term: "unknown", forms: ["id"] }],
    },
    {
      utterance: "Hi",
      targetVocabulary: ["ID", "deposit"],
      vocabularyForms: [{ term: "deposit", forms: ["ID"] }],
    },
    { utterance: "Hi", targetVocabulary: ["ID"], vocabularyForms: [{ term: "ID", forms: ["-"] }] },
  ])("rejects invalid or ambiguous authored input: %j", async (input) => {
    await expect(call(input)).rejects.toThrow();
  });

  it("validates course-level forms and leaves old courses without forms readable", () => {
    expect(scenarioContentSchema.safeParse(hotel).success).toBe(true);
    const original = structuredClone(hotel);
    for (const item of original.courseTemplate.learningPack.vocabulary)
      delete (item as { forms?: string[] }).forms;
    expect(scenarioContentSchema.safeParse(original).success).toBe(true);
    const invalid = structuredClone(hotel);
    invalid.courseTemplate.learningPack.vocabulary[0]!.forms = ["deposit"];
    expect(scenarioContentSchema.safeParse(invalid).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultProfileMemory,
  lessonMemoryContributionSchema,
  profileMemorySchema,
  projectLearningMemory,
  selectLearningMemory,
  type LessonMemoryContribution,
} from "@language-lab/memory";

function lesson(patch: Partial<LessonMemoryContribution> = {}) {
  return lessonMemoryContributionSchema.parse({
    version: 1,
    lessonId: "first",
    title: "Hotel Check-in",
    language: "en",
    difficulty: "A2",
    mode: "ai",
    updatedAt: 1000,
    totalTurns: 1,
    practiceTurns: 1,
    completed: false,
    objectivesCompleted: 0,
    objectiveCount: 1,
    knowledge: [
      {
        term: "reservation",
        usedTurns: 1,
        occurrences: 2,
        latest: { messageSeq: 1, quote: "reservation" },
      },
    ],
    errors: [
      {
        category: "tense",
        original: "I go",
        corrected: "I went",
        explanation: "Use past tense.",
        count: 1,
        guidedCount: 0,
        modelCount: 1,
        latest: { messageSeq: 1, quote: "I go" },
      },
    ],
    ...patch,
  });
}

describe("four-type learning memory projection", () => {
  it("replaces a lesson revision instead of counting repeated saves or restores twice", () => {
    const first = lesson();
    const revised = lesson({
      totalTurns: 2,
      practiceTurns: 2,
      updatedAt: 2000,
      completed: true,
      objectivesCompleted: 1,
      knowledge: [
        {
          term: "reservation",
          usedTurns: 2,
          occurrences: 3,
          latest: { messageSeq: 3, quote: "reservation" },
        },
      ],
    });
    const profile = { targetLanguage: "en", level: "B2" as const, goals: ["Travel conversations"] };
    const memory = projectLearningMemory(profile, [first, revised, revised, first], true);
    expect(memory.profile).toEqual(profile);
    expect(memory.profileSaved).toBe(true);
    expect(memory.knowledge[0]).toMatchObject({
      practiceTurns: 2,
      occurrences: 3,
      lessonCount: 1,
      mastery: "learning",
    });
    expect(memory.errors[0]?.count).toBe(1);
    expect(memory.episodes).toHaveLength(1);
    expect(memory.episodes[0]?.completed).toBe(true);
    const finished = lesson({ completed: true, objectivesCompleted: 1 });
    expect(projectLearningMemory(profile, [finished, first]).episodes[0]?.completed).toBe(true);
  });

  it("keeps supported and free observations separate, without manufacturing mastery", () => {
    const second = lesson({
      lessonId: "second",
      mode: "demo",
      updatedAt: 2000,
      errors: [{ ...lesson().errors[0]!, guidedCount: 1, modelCount: 0 }],
    });
    const memory = projectLearningMemory(defaultProfileMemory(), [lesson(), second]);
    expect(memory.knowledge[0]).toMatchObject({
      practiceTurns: 2,
      guidedTurns: 1,
      freeTurns: 1,
      mastery: "learning",
      lessonCount: 2,
    });
    expect(memory.errors[0]).toMatchObject({
      count: 2,
      guidedCount: 1,
      modelCount: 1,
      lessonCount: 2,
    });
    expect(memory.episodes).toHaveLength(2);
    expect(memory.episodes[0]?.summary).toContain("not independent assessment");
    expect(memory.profileSaved).toBe(false);
  });

  it("scopes retrieval to the course language and target terms while preserving profile ownership", () => {
    const memory = projectLearningMemory(
      { targetLanguage: "en", level: "C1", goals: ["Work travel"] },
      [lesson(), lesson({ lessonId: "spanish", language: "es" })],
      true,
    );
    const snapshot = selectLearningMemory(memory, "es", ["reservation"]);
    expect(snapshot.profile.targetLanguage).toBe("en");
    expect(snapshot.profile.goals).toEqual([]);
    expect(snapshot.knowledge).toHaveLength(1);
    expect(snapshot.episodes).toHaveLength(1);
    expect(selectLearningMemory(memory, "en", ["latte"]).knowledge).toEqual([]);
    expect(selectLearningMemory(memory, "en", []).profile.goals).toEqual(["Work travel"]);
  });

  it("retains more than 50 lesson contributions and bounds only the model view", () => {
    const memory = projectLearningMemory(
      defaultProfileMemory(),
      Array.from({ length: 120 }, (_, index) =>
        lesson({ lessonId: `lesson-${index}`, updatedAt: index + 1 }),
      ),
    );
    expect(memory.episodes).toHaveLength(120);
    expect(memory.knowledge[0]?.practiceTurns).toBe(120);
    expect(selectLearningMemory(memory, "en", ["reservation"]).episodes).toHaveLength(5);
  });

  it("rejects inconsistent counts, completion claims and assistant-style citations", () => {
    const original = lesson();
    expect(lessonMemoryContributionSchema.safeParse({ ...original, completed: true }).success).toBe(
      false,
    );
    expect(
      lessonMemoryContributionSchema.safeParse({ ...original, practiceTurns: 0 }).success,
    ).toBe(false);
    expect(
      lessonMemoryContributionSchema.safeParse({
        ...original,
        knowledge: [{ ...original.knowledge[0], latest: { messageSeq: 2, quote: "reservation" } }],
      }).success,
    ).toBe(false);
    expect(
      lessonMemoryContributionSchema.safeParse({
        ...original,
        errors: [{ ...original.errors[0], guidedCount: 10 }],
      }).success,
    ).toBe(false);
    expect(
      profileMemorySchema.safeParse({
        targetLanguage: "en",
        level: "B1",
        goals: Array(11).fill("A goal"),
      }).success,
    ).toBe(false);
  });
});

// SkillRegistry tests: registration lifecycle + validated invocation.
// The registry is the schema-boundary enforcement point, so both boundary
// failures (input/output) are pinned here.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createDefaultSkillRegistry,
  createMockSkillRegistry,
  DuplicateSkillError,
  FIRST_BATCH_SKILL_IDS,
  SkillRegistry,
  SkillValidationError,
  UnknownSkillError,
  type SkillContext,
} from "@language-lab/skills";

function fakeContext(): SkillContext {
  return {
    userId: "user-1",
    lessonId: "lesson-1",
    conversationId: "conv-1",
    studentProfile: {
      userId: "user-1",
      targetLanguage: "en",
      level: "A2",
      goals: ["order coffee"],
    },
    lessonState: {
      schemaVersion: 1,
      lessonId: "lesson-1",
      scenarioId: "sc",
      phase: "practice",
      difficulty: "A2",
      objectives: [],
      targetVocabulary: [],
      vocabularySeen: {},
      turnCount: 0,
      correctionsGiven: 0,
      hintsGiven: 0,
      updatedAt: 0,
    },
    memory: {
      profile: { targetLanguage: "en", level: "A2", goals: ["order coffee"] },
      knowledge: [],
      errors: [],
      episodes: [],
    },
    modelGateway: {} as SkillContext["modelGateway"],
    data: {
      findScenario: async () => null,
      recentMessages: async () => [],
      recordLearningEvent: async () => undefined,
    },
  };
}

describe("SkillRegistry lifecycle", () => {
  it("registers, lists and looks up skills", () => {
    const registry = new SkillRegistry();
    const def = {
      id: "skills.demo",
      version: "0.1.0",
      description: "demo",
      inputSchema: z.object({}) as z.ZodType<Record<string, never>>,
      outputSchema: z.object({}) as z.ZodType<Record<string, never>>,
      execute: async () => ({}),
    };
    registry.register(def);
    expect(registry.has("skills.demo")).toBe(true);
    expect(registry.ids()).toEqual(["skills.demo"]);
    expect(registry.get("skills.demo")?.id).toBe("skills.demo");
    expect(registry.require("skills.demo")).toBeDefined();
  });

  it("rejects duplicate registration", () => {
    const registry = new SkillRegistry();
    const def = {
      id: "skills.demo",
      version: "0.1.0",
      description: "demo",
      inputSchema: z.object({}) as z.ZodType<Record<string, never>>,
      outputSchema: z.object({}) as z.ZodType<Record<string, never>>,
      execute: async () => ({}),
    };
    registry.register(def);
    expect(() => registry.register(def)).toThrow(DuplicateSkillError);
  });

  it("throws UnknownSkillError on require/call of an unregistered skill", async () => {
    const registry = new SkillRegistry();
    expect(() => registry.require("skills.missing")).toThrow(UnknownSkillError);
    await expect(registry.call("skills.missing", {}, fakeContext())).rejects.toBeInstanceOf(
      UnknownSkillError,
    );
  });
});

describe("SkillRegistry.call validation", () => {
  const echoDef = {
    id: "skills.echo",
    version: "0.1.0",
    description: "echo",
    inputSchema: z.object({ text: z.string().min(1) }) as z.ZodType<{ text: string }>,
    outputSchema: z.object({ echoed: z.string() }) as z.ZodType<{ echoed: string }>,
    execute: async (input: { text: string }) => ({ echoed: input.text }),
  };

  it("validates input before execute() and output before returning", async () => {
    const registry = new SkillRegistry();
    registry.register(echoDef);
    await expect(
      registry.call<{ echoed: string }>("skills.echo", { text: "hi" }, fakeContext()),
    ).resolves.toEqual({ echoed: "hi" });
  });

  it("rejects malformed input with an input-boundary error", async () => {
    const registry = new SkillRegistry();
    registry.register(echoDef);
    try {
      await registry.call("skills.echo", { text: "" }, fakeContext());
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SkillValidationError);
      expect((e as SkillValidationError).boundary).toBe("input");
      expect((e as SkillValidationError).skillId).toBe("skills.echo");
    }
  });

  it("rejects invalid skill output with an output-boundary error", async () => {
    const registry = new SkillRegistry();
    registry.register({
      ...echoDef,
      execute: async () => ({ wrong: "shape" }) as unknown as { echoed: string },
    });
    try {
      await registry.call("skills.echo", { text: "hi" }, fakeContext());
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SkillValidationError);
      expect((e as SkillValidationError).boundary).toBe("output");
    }
  });
});

describe("first-batch registries", () => {
  it("default and mock registries expose exactly the first batch", () => {
    expect(createDefaultSkillRegistry().ids()).toEqual([...FIRST_BATCH_SKILL_IDS]);
    expect(createMockSkillRegistry().ids()).toEqual([...FIRST_BATCH_SKILL_IDS]);
    expect(FIRST_BATCH_SKILL_IDS).toHaveLength(7);
  });
});

describe("mock skills stay deterministic", () => {
  it("mock scenario_selector always picks the first candidate", async () => {
    const registry = createMockSkillRegistry();
    const output = await registry.call<{ scenarioId: string; rationale: string }>(
      "skills.scenario_selector",
      {
        candidates: [
          {
            id: "sc-a",
            slug: "a",
            title: "A",
            category: "daily",
            difficulty: "A2",
            objectives: [],
            targetVocabulary: [],
          },
          {
            id: "sc-b",
            slug: "b",
            title: "B",
            category: "daily",
            difficulty: "A2",
            objectives: [],
            targetVocabulary: [],
          },
        ],
        studentGoals: [],
        studentLevel: "A2",
      },
      fakeContext(),
    );
    expect(output.scenarioId).toBe("sc-a");
    expect(output.rationale).toContain("mock");
  });
});

describe("real scenario_selector scoring", () => {
  it("prefers candidates matching student goals at the right level", async () => {
    const registry = createDefaultSkillRegistry();
    const output = await registry.call<{ scenarioId: string }>(
      "skills.scenario_selector",
      {
        candidates: [
          {
            id: "sc-gym",
            slug: "gym",
            title: "At the gym",
            category: "fitness",
            difficulty: "B2",
            objectives: [],
            targetVocabulary: [],
          },
          {
            id: "sc-cafe",
            slug: "cafe",
            title: "Ordering coffee",
            category: "daily",
            difficulty: "A2",
            objectives: ["order a coffee politely"],
            targetVocabulary: [],
          },
        ],
        studentGoals: ["order coffee"],
        studentLevel: "A2",
      },
      fakeContext(),
    );
    expect(output.scenarioId).toBe("sc-cafe");
  });
});

import { describe, expect, it, vi } from "vitest";
import { TeachingOrchestrator } from "@language-lab/agent-runtime";
import {
  restoreLessonState,
  scenarioContentSchema,
  serializeLessonState,
  type LessonState,
} from "@language-lab/core";
import { createGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  createDialogueRoleplaySkill,
  createMockSkillRegistry,
  SkillRegistry,
  type DialogueRoleplayInput,
} from "@language-lab/skills";
import cafeOrder from "../../../content/scenarios/cafe-order.json";

function setup() {
  const scenario = scenarioContentSchema.parse(cafeOrder);
  const states = new Map<string, LessonState>();
  const llm = new MockLlmProvider(
    {},
    Array.from({ length: 6 }, () =>
      JSON.stringify({ reply: "What would you like?", tone: "encouraging" }),
    ),
  );
  const generation = vi.spyOn(llm, "generateStructured");
  const skills = new SkillRegistry();
  const mocks = createMockSkillRegistry();
  for (const id of mocks.ids())
    skills.register(
      id === "skills.dialogue_roleplay" ? createDialogueRoleplaySkill() : mocks.require(id),
    );
  const orchestrator = new TeachingOrchestrator({
    skills,
    gateway: createGateway({ llm }),
    stateStore: {
      load: async (id) => states.get(id) ?? null,
      // JSON persistence, rather than sharing state references, exercises restore.
      save: async (state) => {
        states.set(state.lessonId, restoreLessonState(serializeLessonState(state)));
      },
    },
    profile: {
      profile: async () => ({ userId: "u", targetLanguage: "fr", level: "A1", goals: [] }),
    },
    memory: {
      snapshot: async () => ({
        profile: { targetLanguage: "fr", level: "A1", goals: [] },
        knowledge: [],
        errors: [],
        episodes: [],
      }),
    },
    data: {
      findScenario: async () => scenario,
      recentMessages: async () => [],
      recordLearningEvent: async () => {},
    },
    now: () => 42,
  });
  const base = { userId: "u", lessonId: "lesson", conversationId: "conversation" };
  const init = { ...base, studentLevel: "A2", studentGoals: [], scenarioCandidates: [scenario] };
  const turn = { ...base, mode: "text" as const, utterance: "I go to the cafe yesterday" };
  return { scenario, states, generation, skills, orchestrator, init, turn };
}

describe("configured teaching courses", () => {
  it("uses the snapshotted role, level, language, expressions and current stage in the real dialogue prompt", async () => {
    const { scenario, generation, states, orchestrator, init, turn } = setup();
    await orchestrator.initLesson({ ...init, configuration: { difficulty: "B1" } });
    scenario.courseTemplate!.roles.partner = "A changed role after app update";
    await orchestrator.processStudentTurn(turn);
    const system = generation.mock.calls[0]![0].messages[0]!.content;
    expect(system).toContain(cafeOrder.courseTemplate.roles.partner);
    expect(system).not.toContain("changed role");
    expect(system).toContain("Student level: B1 en");
    expect(system).toContain(cafeOrder.courseTemplate.targetPatterns[0]!.example);
    expect(system).toContain(cafeOrder.courseTemplate.stages[0]!.successCriteria[0]);
    const state = states.get("lesson")!;
    states.set("lesson", {
      ...state,
      objectives: state.objectives.map((objective, index) => ({
        ...objective,
        completed: index === 0,
      })),
    });
    await orchestrator.processStudentTurn({ ...turn, utterance: "Do you have oat milk?" });
    expect(generation.mock.calls[1]![0].messages[0]!.content).toContain(
      "Current stage: Choose size and milk",
    );
  });

  it("enforces correction and hint budgets after a saved lesson is restored", async () => {
    const { orchestrator, init, turn } = setup();
    await orchestrator.initLesson({
      ...init,
      configuration: { teachingPolicy: { maxCorrections: 1, maxHints: 1 } },
    });
    expect((await orchestrator.processStudentTurn(turn)).teachingAction).toBe("light_correction");
    expect((await orchestrator.processStudentTurn(turn)).teachingAction).toBe(
      "continue_conversation",
    );
    const halting = { ...turn, utterance: "I go yesterday and I am agree" };
    expect((await orchestrator.processStudentTurn(halting)).teachingAction).toBe("provide_hint");
    const final = await orchestrator.processStudentTurn(halting);
    expect(final.teachingAction).toBe("continue_conversation");
    expect(final.state.correctionsGiven).toBe(1);
    expect(final.state.hintsGiven).toBe(1);
  });

  it("turns corrections and scaffolding off when configured", async () => {
    const { orchestrator, skills, init, turn } = setup();
    const dialogue = vi.spyOn(skills.require("skills.dialogue_roleplay"), "execute");
    await orchestrator.initLesson({
      ...init,
      configuration: { teachingPolicy: { correctionMode: "off", maxHints: 0 } },
    });
    const output = await orchestrator.processStudentTurn({
      ...turn,
      utterance: "I go yesterday and I am agree",
    });
    expect(output.teachingAction).toBe("continue_conversation");
    expect((dialogue.mock.calls[0]![0] as DialogueRoleplayInput).course?.allowHints).toBe(false);
    expect(output.persistedEvents.some((event) => event.type === "correction_given")).toBe(false);
  });

  it("rejects invalid course configuration before saving lesson state", async () => {
    const { states, orchestrator, init } = setup();
    await expect(
      orchestrator.initLesson({ ...init, configuration: { teachingPolicy: { maxHints: -1 } } }),
    ).rejects.toThrow();
    expect(states.size).toBe(0);
  });
});

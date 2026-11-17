// Unit tests for the Teaching Agent runtime (Task 06 acceptance criteria):
// registry registration/lookup/invocation, schema boundary enforcement,
// a full mock teaching flow, and LessonState save/restore round-trips.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  createMockSkillRegistry,
  SkillRegistry,
  SkillValidationError,
  UnknownSkillError,
  DuplicateSkillError,
  type SkillContext,
  type SkillDataPorts,
} from "@language-lab/skills";
import { TeachingOrchestrator, LessonNotInitializedError } from "@language-lab/agent-runtime";
import {
  createInitialLessonState,
  serializeLessonState,
  restoreLessonState,
} from "@language-lab/core";
import type { LessonState } from "@language-lab/core";

// ---------------------------------------------------------------------------
// In-memory fakes for the orchestrator ports.
// ---------------------------------------------------------------------------

class FakeStateStore {
  private readonly states = new Map<string, LessonState>();

  async load(lessonId: string): Promise<LessonState | null> {
    return this.states.get(lessonId) ?? null;
  }

  async save(state: LessonState): Promise<void> {
    this.states.set(state.lessonId, state);
  }
}

const fakeMemory = {
  snapshot: async () => ({
    profile: { targetLanguage: "en", level: "A2", goals: ["travel"] },
    knowledge: [],
    errors: [],
    episodes: [],
  }),
};

const fakeProfile = {
  profile: async () => ({ userId: "u1", targetLanguage: "en", level: "A2", goals: ["travel"] }),
};

function fakeDataPorts(events: { type: string }[] = []): SkillDataPorts {
  return {
    findScenario: async (id) =>
      id === "sc-hotel"
        ? {
            id: "sc-hotel",
            slug: "hotel-checkin",
            title: "Hotel Check-in",
            category: "travel",
            difficulty: "A2",
            objectives: ["Ask for a room", "Ask about breakfast"],
            targetVocabulary: ["reservation", "deposit", "breakfast"],
          }
        : null,
    recentMessages: async () => [],
    recordLearningEvent: async (event) => {
      events.push({ type: event.type });
    },
  };
}

function buildOrchestrator(overrides?: {
  skills?: SkillRegistry;
  data?: SkillDataPorts;
  store?: FakeStateStore;
  events?: { type: string }[];
}) {
  const recordedEvents = overrides?.events ?? [];
  const orchestrator = new TeachingOrchestrator({
    skills: overrides?.skills ?? createMockSkillRegistry(),
    gateway: createMockGateway(),
    stateStore: overrides?.store ?? new FakeStateStore(),
    memory: fakeMemory,
    profile: fakeProfile,
    data: overrides?.data ?? fakeDataPorts(recordedEvents),
    now: () => 1_000_000,
  });
  return { orchestrator, recordedEvents };
}

const baseInput = {
  userId: "u1",
  lessonId: "l1",
  conversationId: "c1",
  mode: "text" as const,
};

/** Initializes the canonical hotel lesson on any orchestrator. */
async function initHotelLesson(orchestrator: TeachingOrchestrator): Promise<void> {
  await orchestrator.initLesson({
    ...baseInput,
    studentLevel: "A2",
    studentGoals: ["travel"],
    scenarioCandidates: [
      {
        id: "sc-hotel",
        slug: "hotel-checkin",
        title: "Hotel Check-in",
        category: "travel",
        difficulty: "A2",
        objectives: ["Ask for a room", "Ask about breakfast"],
        targetVocabulary: ["reservation", "deposit", "breakfast"],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. Registry: register / query / invoke.
// ---------------------------------------------------------------------------

describe("SkillRegistry", () => {
  it("registers, queries and lists skills", () => {
    const registry = createMockSkillRegistry();
    expect(registry.ids()).toHaveLength(8);
    expect(registry.has("skills.error_diagnosis")).toBe(true);
    expect(registry.has("skills.nonexistent")).toBe(false);
    expect(registry.require("skills.error_diagnosis").id).toBe("skills.error_diagnosis");
    expect(() => registry.require("skills.nonexistent")).toThrow(UnknownSkillError);
  });

  it("rejects duplicate registration", () => {
    const registry = createMockSkillRegistry();
    const skill = registry.require("skills.error_diagnosis");
    expect(() => registry.register(skill)).toThrow(DuplicateSkillError);
  });

  it("invokes a skill through the registry", async () => {
    const registry = createMockSkillRegistry();
    const context = makeContext();
    const output = await registry.call<{ used: string[]; missed: string[] }>(
      "skills.vocabulary_tracker",
      { utterance: "I have a reservation", targetVocabulary: ["reservation", "deposit"] },
      context,
    );
    expect(output.used).toEqual(["reservation"]);
    expect(output.missed).toEqual(["deposit"]);
  });

  it("rejects malformed input at the boundary", async () => {
    const registry = createMockSkillRegistry();
    await expect(
      registry.call("skills.vocabulary_tracker", { wrong: "shape" }, makeContext()),
    ).rejects.toThrow(SkillValidationError);
  });

  it("rejects malformed output at the boundary", async () => {
    const registry = new SkillRegistry();
    registry.register({
      id: "test.bad_output",
      version: "0.0.1",
      description: "violates its own output schema",
      inputSchema: z.object({}),
      outputSchema: z.object({ value: z.number() }),
      async execute() {
        return { value: "not a number" } as unknown as { value: number };
      },
    });
    await expect(registry.call("test.bad_output", {}, makeContext())).rejects.toThrow(
      SkillValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Full mock teaching flow: init -> turn -> state update.
// ---------------------------------------------------------------------------

describe("TeachingOrchestrator (mock flow)", () => {
  it("initializes a lesson with state derived from the selected scenario", async () => {
    const { orchestrator } = buildOrchestrator();
    const result = await orchestrator.initLesson({
      ...baseInput,
      studentLevel: "A2",
      studentGoals: ["travel"],
      scenarioCandidates: [
        {
          id: "sc-hotel",
          slug: "hotel-checkin",
          title: "Hotel Check-in",
          category: "travel",
          difficulty: "A2",
          objectives: ["Ask for a room", "Ask about breakfast"],
          targetVocabulary: ["reservation", "deposit", "breakfast"],
        },
      ],
    });
    expect(result.scenarioId).toBe("sc-hotel");
    expect(result.state.phase).toBe("briefing");
    expect(result.state.objectives).toHaveLength(2);
    expect(result.state.targetVocabulary).toEqual(["reservation", "deposit", "breakfast"]);
  });

  it("fails init when no candidate scenarios exist", async () => {
    const { orchestrator } = buildOrchestrator();
    await expect(
      orchestrator.initLesson({
        ...baseInput,
        studentLevel: "A2",
        studentGoals: [],
        scenarioCandidates: [],
      }),
    ).rejects.toThrow(/no candidate scenarios/);
  });

  it("runs a complete mock turn: analysis -> decision -> reply -> persisted state", async () => {
    const { orchestrator, recordedEvents } = buildOrchestrator();
    await initHotelLesson(orchestrator);

    const output = await orchestrator.processStudentTurn({
      ...baseInput,
      utterance: "I go to hotel yesterday with my reservation",
    });

    // Analysis captured the tense error and the target vocabulary.
    expect(output.analysis.errors[0]?.category).toBe("tense");
    expect(output.analysis.vocabularyUsed).toContain("reservation");

    // Deterministic decision: one error -> light_correction with the fix.
    expect(output.teachingAction).toBe("light_correction");
    expect(output.reply).toContain("mock reply");

    // State advanced deterministically.
    expect(output.state.turnCount).toBe(1);
    expect(output.state.correctionsGiven).toBe(1);
    expect(output.state.vocabularySeen["reservation"]).toBe(1);
    expect(output.state.phase).toBe("briefing");

    // Learning events were persisted through the data ports.
    const types = recordedEvents.map((e) => e.type);
    expect(types).toContain("vocabulary_used");
    expect(types).toContain("error_made");
    expect(types).toContain("correction_given");

    // Skill trace recorded all four invoked skills, all successful.
    expect(output.skillTrace.map((t) => t.skillId)).toEqual([
      "skills.error_diagnosis",
      "skills.vocabulary_tracker",
      "skills.teaching_intervention",
      "skills.dialogue_roleplay",
    ]);
    expect(output.skillTrace.every((t) => t.ok)).toBe(true);
  });

  it("completes the task and moves to debrief when objectives finish", async () => {
    const { orchestrator } = buildOrchestrator();
    await initHotelLesson(orchestrator);
    // Simulate both objectives already completed mid-lesson.
    const store = orchestrator["deps"].stateStore;
    const state = (await store.load("l1"))!;
    await store.save({
      ...state,
      phase: "practice",
      objectives: state.objectives.map((o) => ({ ...o, completed: true })),
    });

    const output = await orchestrator.processStudentTurn({
      ...baseInput,
      utterance: "hello there",
    });
    expect(output.teachingAction).toBe("complete_task");
    expect(output.state.phase).toBe("debrief");
  });

  it("throws a clear error when the lesson was never initialized", async () => {
    const { orchestrator } = buildOrchestrator();
    await expect(
      orchestrator.processStudentTurn({ ...baseInput, utterance: "hi" }),
    ).rejects.toThrow(LessonNotInitializedError);
  });

  it("emits lifecycle AgentEvents during the turn", async () => {
    const agentEvents: { kind: string }[] = [];
    const recordedEvents: { type: string }[] = [];
    const orchestrator = new TeachingOrchestrator({
      skills: createMockSkillRegistry(),
      gateway: createMockGateway(),
      stateStore: new FakeStateStore(),
      memory: fakeMemory,
      profile: fakeProfile,
      data: fakeDataPorts(recordedEvents),
      onEvent: (e) => agentEvents.push({ kind: e.kind }),
      now: () => 1_000_000,
    });
    await initHotelLesson(orchestrator);
    await orchestrator.processStudentTurn({ ...baseInput, utterance: "hello" });

    const kinds = agentEvents.map((e) => e.kind);
    expect(kinds).toContain("lesson_initialized");
    expect(kinds).toContain("skill_started");
    expect(kinds).toContain("decision_made");
    expect(kinds).toContain("state_persisted");
    expect(kinds).toContain("turn_completed");
  });
});

// ---------------------------------------------------------------------------
// 3. State serialization: save -> restore -> continue.
// ---------------------------------------------------------------------------

describe("LessonState serialization", () => {
  it("round-trips through JSON without loss", () => {
    const state = createInitialLessonState({
      lessonId: "l1",
      scenarioId: "sc-hotel",
      objectives: [{ id: "obj-1", description: "Ask for a room" }],
      targetVocabulary: ["reservation"],
      now: 42,
    });
    const restored = restoreLessonState(serializeLessonState(state));
    expect(restored).toEqual(state);
  });

  it("rejects corrupted state payloads", () => {
    expect(() => restoreLessonState('{"lessonId": "l1"}')).toThrow();
    expect(() => restoreLessonState("not json at all")).toThrow();
  });

  it("restores state and continues the lesson with preserved counters", async () => {
    const { orchestrator } = buildOrchestrator();
    await initHotelLesson(orchestrator);
    await orchestrator.processStudentTurn({ ...baseInput, utterance: "I have a reservation" });

    // Serialize -> wipe the store -> restore (simulates app restart).
    const snapshot = serializeLessonState((await orchestrator["deps"].stateStore.load("l1"))!);
    const fresh = buildOrchestrator();
    const restoredState = restoreLessonState(snapshot);
    await fresh.orchestrator["deps"].stateStore.save(restoredState);

    const output = await fresh.orchestrator.processStudentTurn({
      ...baseInput,
      utterance: "What about the deposit?",
    });
    expect(output.state.turnCount).toBe(2);
    expect(output.state.correctionsGiven).toBe(0); // turn 1 had no errors
    expect(output.state.vocabularySeen["deposit"]).toBe(1); // accumulated
  });
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function makeContext(): SkillContext {
  return {
    userId: "u1",
    lessonId: "l1",
    conversationId: "c1",
    studentProfile: { userId: "u1", targetLanguage: "en", level: "A2", goals: [] },
    lessonState: createInitialLessonState({
      lessonId: "l1",
      scenarioId: "sc-hotel",
      now: 0,
    }),
    memory: {
      profile: { targetLanguage: "en", level: "A2", goals: [] },
      knowledge: [],
      errors: [],
      episodes: [],
    },
    modelGateway: createMockGateway(),
    data: fakeDataPorts(),
  };
}

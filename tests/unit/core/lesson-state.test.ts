// LessonState: the single source of teaching truth. These tests pin the
// state machine transitions, counter updates and the serialize/restore
// round-trip that everything (SQLite / IPC / backups) depends on.

import { describe, expect, it } from "vitest";
import {
  applyTeachingAction,
  canTransition,
  createInitialLessonState,
  PHASE_TRANSITIONS,
  restoreLessonState,
  serializeLessonState,
  type LessonState,
} from "@language-lab/core";

const T0 = 1_700_000_000_000;

function makeState(patch: Partial<LessonState> = {}): LessonState {
  return {
    ...createInitialLessonState({
      lessonId: "lesson-1",
      scenarioId: "scenario-cafe",
      objectives: [{ id: "obj-1", description: "order a drink" }],
      targetVocabulary: ["latte", "espresso"],
      now: T0,
    }),
    ...patch,
  };
}

describe("createInitialLessonState", () => {
  it("starts in briefing with zeroed counters and incomplete objectives", () => {
    const state = createInitialLessonState({
      lessonId: "lesson-1",
      scenarioId: "scenario-cafe",
      objectives: [{ id: "obj-1", description: "order a drink" }],
      now: T0,
    });
    expect(state.phase).toBe("briefing");
    expect(state.schemaVersion).toBe(1);
    expect(state.difficulty).toBe("A2");
    expect(state.objectives).toEqual([
      { id: "obj-1", description: "order a drink", completed: false },
    ]);
    expect(state.vocabularySeen).toEqual({});
    expect(state.turnCount).toBe(0);
    expect(state.correctionsGiven).toBe(0);
    expect(state.hintsGiven).toBe(0);
    expect(state.updatedAt).toBe(T0);
  });

  it("does not mutate the caller-provided objective array", () => {
    const objectives = [{ id: "obj-1", description: "order a drink" }];
    const state = createInitialLessonState({
      lessonId: "l",
      scenarioId: "s",
      objectives,
      now: T0,
    });
    expect(objectives.every((o) => !("completed" in o) || o.completed === undefined)).toBe(true);
    expect(state.objectives[0]?.completed).toBe(false);
  });
});

describe("PHASE_TRANSITIONS / canTransition", () => {
  it("allows the forward path setup -> briefing -> practice -> debrief -> done", () => {
    expect(canTransition("setup", "briefing")).toBe(true);
    expect(canTransition("briefing", "practice")).toBe(true);
    expect(canTransition("practice", "debrief")).toBe(true);
    expect(canTransition("debrief", "done")).toBe(true);
  });

  it("allows self-loops for every non-terminal phase", () => {
    expect(canTransition("setup", "setup")).toBe(true);
    expect(canTransition("briefing", "briefing")).toBe(true);
    expect(canTransition("practice", "practice")).toBe(true);
    expect(canTransition("debrief", "debrief")).toBe(true);
  });

  it("rejects terminal done and illegal jumps", () => {
    expect(canTransition("done", "done")).toBe(false);
    expect(canTransition("practice", "briefing")).toBe(false);
    expect(canTransition("debrief", "practice")).toBe(false);
    expect(canTransition("setup", "debrief")).toBe(false);
    expect(canTransition("briefing", "debrief")).toBe(false);
  });

  it("covers all phases in the transition table", () => {
    expect(Object.keys(PHASE_TRANSITIONS).sort()).toEqual([
      "briefing",
      "debrief",
      "done",
      "practice",
      "setup",
    ]);
  });
});

describe("applyTeachingAction", () => {
  it("counts turns and bumps the right counter per action", () => {
    let state = makeState();
    state = applyTeachingAction(state, "light_correction", { now: T0 + 1 });
    expect(state.turnCount).toBe(1);
    expect(state.correctionsGiven).toBe(1);
    expect(state.hintsGiven).toBe(0);

    state = applyTeachingAction(state, "provide_hint", { now: T0 + 2 });
    expect(state.turnCount).toBe(2);
    expect(state.hintsGiven).toBe(1);
    expect(state.updatedAt).toBe(T0 + 2);
  });

  it("records vocabulary case-insensitively with repetition counts", () => {
    let state = makeState();
    state = applyTeachingAction(state, "continue_conversation", {
      vocabularyUsed: ["Latte", "LATTE", "espresso"],
      now: T0,
    });
    expect(state.vocabularySeen).toEqual({ latte: 2, espresso: 1 });
  });

  it("completes the first incomplete objective on complete_task", () => {
    const state = makeState({
      objectives: [
        { id: "obj-1", description: "a", completed: false },
        { id: "obj-2", description: "b", completed: false },
      ],
      phase: "practice",
    });
    const next = applyTeachingAction(state, "complete_task", { now: T0 });
    expect(next.objectives[0]?.completed).toBe(true);
    expect(next.objectives[1]?.completed).toBe(false);
    // Not all objectives completed yet, so the phase must stay practice.
    expect(next.phase).toBe("practice");
  });

  it("moves practice -> debrief only when every objective is completed", () => {
    const state = makeState({
      objectives: [{ id: "obj-1", description: "a", completed: false }],
      phase: "practice",
    });
    const next = applyTeachingAction(state, "complete_task", { now: T0 });
    expect(next.objectives.every((o) => o.completed)).toBe(true);
    expect(next.phase).toBe("debrief");
  });

  it("keeps the phase when complete_task fires with no objectives", () => {
    const state = makeState({ objectives: [], phase: "practice" });
    const next = applyTeachingAction(state, "complete_task", { now: T0 });
    expect(next.phase).toBe("practice");
  });

  it("throws on an illegal transition from the terminal done phase", () => {
    const state = makeState({ phase: "done" });
    expect(() => applyTeachingAction(state, "continue_conversation", { now: T0 })).toThrow(
      /illegal phase transition/,
    );
  });

  it("never mutates the input state", () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    applyTeachingAction(state, "light_correction", { now: T0 + 1 });
    expect(state).toEqual(snapshot);
  });
});

describe("serialize / restore round-trip", () => {
  it("round-trips a state through JSON losslessly", () => {
    let state = makeState();
    state = applyTeachingAction(state, "continue_conversation", {
      vocabularyUsed: ["latte"],
      now: T0 + 5,
    });
    const json = serializeLessonState(state);
    expect(restoreLessonState(json)).toEqual(state);
  });

  it("refuses to serialize an invalid state", () => {
    const bad = { ...makeState(), schemaVersion: 2 } as unknown as LessonState;
    expect(() => serializeLessonState(bad)).toThrow();
  });

  it("refuses to restore tampered JSON", () => {
    const json = serializeLessonState(makeState());
    const tampered = JSON.parse(json) as Record<string, unknown>;
    tampered.turnCount = -1;
    expect(() => restoreLessonState(JSON.stringify(tampered))).toThrow();
    expect(() => restoreLessonState("not json")).toThrow();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyTeachingAction,
  configureScenarioContent,
  createLessonStateFromScenario,
  getCurrentCourseStage,
  restoreLessonState,
  scenarioContentSchema,
  serializeLessonState,
} from "@language-lab/core";
import cafeOrder from "../../../content/scenarios/cafe-order.json";

describe("versioned scenario courses", () => {
  it("keeps the published JSON Schema in sync with the boundary schema", () => {
    const schema = JSON.parse(
      readFileSync(join(__dirname, "../../../content/scenario.schema.json"), "utf8"),
    );
    expect(schema).toEqual(z.toJSONSchema(scenarioContentSchema, { io: "input" }));
  });

  it("accepts legacy content and state without inventing a course", () => {
    const { courseTemplate: _course, schemaVersion: _version, ...legacy } = cafeOrder;
    const state = createLessonStateFromScenario({ lessonId: "legacy", scenario: legacy, now: 0 });
    expect(state.courseTemplate).toBeUndefined();
    expect(state.objectives[0]?.id).toBe("obj-1");
    expect(restoreLessonState(serializeLessonState(state))).toEqual(state);
  });

  it.each([
    [
      "unsupported version",
      (raw: Record<string, unknown>) => {
        raw.schemaVersion = 2;
      },
    ],
    [
      "unknown authoring field",
      (raw: Record<string, unknown>) => {
        raw.courseTemplte = {};
      },
    ],
    [
      "invalid CEFR level",
      (raw: Record<string, unknown>) => {
        raw.difficulty = "beginner";
      },
    ],
  ])("rejects %s", (_, mutate) => {
    const raw: Record<string, unknown> = structuredClone(cafeOrder);
    mutate(raw);
    expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects dangling, repeated and uncovered objective references", () => {
    for (const id of ["obj-99", "obj-2"]) {
      const raw = structuredClone(cafeOrder);
      raw.courseTemplate.stages[0]!.objectiveIds = [id];
      expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
    }
    const raw = structuredClone(cafeOrder);
    raw.courseTemplate.stages.pop();
    expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects duplicate stage ids, empty roles and empty success criteria", () => {
    const raw = structuredClone(cafeOrder);
    raw.courseTemplate.stages[1]!.id = raw.courseTemplate.stages[0]!.id;
    expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
    raw.courseTemplate.stages[1]!.id = "unique-stage";
    raw.courseTemplate.roles.partner = "   ";
    expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
    raw.courseTemplate.roles.partner = "Barista";
    raw.courseTemplate.stages[0]!.successCriteria = [];
    expect(scenarioContentSchema.safeParse(raw).success).toBe(false);
  });

  it("applies partial configuration without mutating the template", () => {
    const original = structuredClone(cafeOrder);
    const configured = configureScenarioContent(original, {
      difficulty: "B1",
      teachingPolicy: { maxHints: 0 },
    });
    expect(configured.difficulty).toBe("B1");
    expect(configured.courseTemplate?.teachingPolicy).toEqual({
      correctionMode: "gentle",
      maxHints: 0,
      maxCorrections: 3,
    });
    configured.courseTemplate!.roles.partner = "A different partner";
    expect(original).toEqual(cafeOrder);
    for (const maxHints of [-1, 0.5, 21, NaN]) {
      expect(() => configureScenarioContent(cafeOrder, { teachingPolicy: { maxHints } })).toThrow();
    }
  });

  it("snapshots the configured course and preserves it across restore", () => {
    const raw = structuredClone(cafeOrder);
    const state = createLessonStateFromScenario({
      lessonId: "lesson",
      scenario: raw,
      configuration: { difficulty: "B2" },
      now: 42,
    });
    raw.courseTemplate.roles.partner = "Changed content";
    const restored = restoreLessonState(serializeLessonState(state));
    expect(restored).toEqual(state);
    expect(restored.difficulty).toBe("B2");
    expect(restored.courseTemplate?.roles.partner).toBe(cafeOrder.courseTemplate.roles.partner);
    expect(getCurrentCourseStage(restored)?.id).toBe("place-order");
    const progressed = {
      ...restored,
      objectives: restored.objectives.map((objective, index) => ({
        ...objective,
        completed: index === 0,
      })),
    };
    expect(getCurrentCourseStage(progressed)?.id).toBe("choose-options");
    expect(
      getCurrentCourseStage({
        ...progressed,
        objectives: progressed.objectives.map((objective) => ({ ...objective, completed: true })),
      }),
    ).toBeUndefined();
  });

  it("refuses a restored snapshot whose stages reference different objectives", () => {
    const state = createLessonStateFromScenario({
      lessonId: "lesson",
      scenario: cafeOrder,
      now: 0,
    });
    const raw = JSON.parse(serializeLessonState(state));
    raw.courseTemplate.stages[0].objectiveIds = ["obj-99"];
    expect(() => restoreLessonState(JSON.stringify(raw))).toThrow();
  });

  it("completes the current authored stage when stages use a different objective order", () => {
    const scenario = structuredClone(cafeOrder);
    scenario.courseTemplate.stages.reverse();
    const state = {
      ...createLessonStateFromScenario({ lessonId: "lesson", scenario, now: 0 }),
      phase: "practice" as const,
    };
    const next = applyTeachingAction(state, "complete_task", { now: 1 });
    expect(next.objectives.map((objective) => objective.completed)).toEqual([false, false, true]);
    expect(getCurrentCourseStage(next)?.id).toBe("choose-options");
    // Completing every stage still reaches debrief through the state machine.
    const last = applyTeachingAction(
      applyTeachingAction(next, "complete_task", { now: 2 }),
      "complete_task",
      { now: 3 },
    );
    expect(last.phase).toBe("debrief");
  });
});

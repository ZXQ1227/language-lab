import { describe, expect, it } from "vitest";
import {
  applyStageAssessment,
  applyTeachingAction,
  createLessonStateFromScenario,
  getCurrentCourseStage,
  restoreLessonState,
  serializeLessonState,
  type StageAssessment,
} from "@language-lab/core";
import cafe from "../../../content/scenarios/cafe-order.json";

const transcript = [
  { seq: 0, role: "assistant" as const, content: "Order a latte and a muffin, please." },
  { seq: 1, role: "user" as const, content: "Could I have a latte and a muffin, please?" },
];
function fixture() {
  const state = {
    ...createLessonStateFromScenario({ lessonId: "lesson", scenario: cafe, now: 0 }),
    phase: "practice" as const,
  };
  const stage = getCurrentCourseStage(state)!;
  const assessment: StageAssessment = {
    stageId: stage.id,
    criteria: stage.successCriteria.map((_, criterionIndex) => ({
      criterionIndex,
      met: true,
      evidence: [{ messageSeq: 1, quote: transcript[1]!.content }],
    })),
    feedback: "Drink, snack and politeness demonstrated.",
  };
  return { state, assessment };
}

describe("grounded stage assessment", () => {
  it("advances only the current stage and round-trips its learner evidence", () => {
    const { state, assessment } = fixture();
    const next = applyStageAssessment(state, assessment, transcript, 42);
    expect(next.objectives.map((objective) => objective.completed)).toEqual([true, false, false]);
    expect(next.turnCount).toBe(0); // The turn action owns the counter.
    expect(getCurrentCourseStage(next)?.id).toBe("choose-options");
    expect(restoreLessonState(serializeLessonState(next))).toEqual(next);
    expect(state.objectives.every((objective) => !objective.completed)).toBe(true);
  });

  it("retains partial criteria without completing the objective", () => {
    const { state, assessment } = fixture();
    assessment.criteria[0] = { criterionIndex: 0, met: false, evidence: [] };
    const next = applyStageAssessment(state, assessment, transcript, 1);
    expect(getCurrentCourseStage(next)?.id).toBe("place-order");
    expect(next.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(next.stageAssessments?.[assessment.stageId]?.criteria[1]?.met).toBe(true);
  });

  it.each([
    [
      "assistant citation",
      (value: StageAssessment) => {
        value.criteria[0]!.evidence = [{ messageSeq: 0, quote: transcript[0]!.content }];
      },
    ],
    [
      "invented quote",
      (value: StageAssessment) => {
        value.criteria[0]!.evidence[0]!.quote = "I mastered this lesson";
      },
    ],
    [
      "unknown message",
      (value: StageAssessment) => {
        value.criteria[0]!.evidence[0]!.messageSeq = 99;
      },
    ],
    [
      "empty evidence",
      (value: StageAssessment) => {
        value.criteria[0]!.evidence = [];
      },
    ],
    [
      "duplicate criterion",
      (value: StageAssessment) => {
        value.criteria[1]!.criterionIndex = 0;
      },
    ],
    [
      "missing criterion",
      (value: StageAssessment) => {
        value.criteria.pop();
      },
    ],
    [
      "unknown criterion",
      (value: StageAssessment) => {
        value.criteria[0]!.criterionIndex = 99;
      },
    ],
    [
      "wrong stage",
      (value: StageAssessment) => {
        value.stageId = "confirm-order";
      },
    ],
  ])("rejects %s before changing progress", (_, mutate) => {
    const { state, assessment } = fixture();
    const before = serializeLessonState(state);
    mutate(assessment);
    expect(() => applyStageAssessment(state, assessment, transcript)).toThrow();
    expect(serializeLessonState(state)).toBe(before);
  });

  it("never treats a complete_task action as evidence for authored courses", () => {
    const { state } = fixture();
    expect(
      applyTeachingAction(state, "complete_task", { now: 1 }).objectives.every(
        (objective) => !objective.completed,
      ),
    ).toBe(true);
    expect(() =>
      applyStageAssessment({ ...state, phase: "done" }, fixture().assessment, transcript),
    ).toThrow(/practice phase/);
  });

  it("keeps a previously verified criterion when the next response only demonstrates the other one", () => {
    const { state, assessment } = fixture();
    assessment.criteria[1] = { criterionIndex: 1, met: false, evidence: [] };
    const partial = applyStageAssessment(state, assessment, transcript, 1);
    const next = structuredClone(assessment);
    next.criteria[0] = { criterionIndex: 0, met: false, evidence: [] };
    next.criteria[1] = {
      criterionIndex: 1,
      met: true,
      evidence: [{ messageSeq: 1, quote: "please" }],
    };
    const completed = applyStageAssessment(partial, next, transcript, 2);
    expect(completed.objectives[0]?.completed).toBe(true);
    expect(
      completed.stageAssessments?.[assessment.stageId]?.criteria.every(
        (criterion) => criterion.met,
      ),
    ).toBe(true);
  });
});

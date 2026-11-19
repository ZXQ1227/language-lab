import { describe, expect, it, vi } from "vitest";
import { createLessonStateFromScenario } from "@language-lab/core";
import { createGateway, GatewayError, MockLlmProvider } from "@language-lab/model-gateway";
import { courseGoalMaxLength, designCourse } from "@language-lab/skills";
import { interviewCourseDraft, practiceGoal } from "../../fixtures/course-designer";

const input = { goal: ` ${practiceGoal} `, level: "B1", targetLanguage: "en-GB" } as const;

describe("Course Designer", () => {
  it("sends only the practice brief and compiles a valid lesson with app-owned references", async () => {
    const llm = new MockLlmProvider({}, [JSON.stringify(interviewCourseDraft)]);
    const call = vi.spyOn(llm, "generateStructured");
    const signal = new AbortController().signal;
    const scenario = await designCourse(input, { modelGateway: createGateway({ llm }), signal });

    expect(call).toHaveBeenCalledTimes(1);
    const [request, , options] = call.mock.calls[0]!;
    expect(JSON.parse(request.messages[1]!.content)).toEqual({
      goal: practiceGoal,
      targetLanguage: "en-GB",
      level: "B1",
      estimatedMinutes: 10,
    });
    expect(options?.signal).toBe(signal);
    expect(scenario).toMatchObject({
      id: expect.stringMatching(/^ai-[a-f0-9-]{36}$/),
      slug: scenario.id,
      difficulty: "B1",
      objectives: interviewCourseDraft.stages.map((stage) => stage.objective),
    });
    const state = createLessonStateFromScenario({ lessonId: "test-lesson", scenario, now: 0 });
    expect(state.courseTemplate).toMatchObject({
      roles: { learner: "Job candidate", partner: "Recruiter" },
      targetLanguage: "en-GB",
      estimatedMinutes: 10,
      openingLine: interviewCourseDraft.openingLine,
      stages: interviewCourseDraft.stages.map((stage, index) => ({
        id: `stage-${index + 1}`,
        objectiveIds: [`obj-${index + 1}`],
        successCriteria: stage.successCriteria,
        hints: [stage.hint],
      })),
      teachingPolicy: { correctionMode: "gentle", maxCorrections: 2, maxHints: 3 },
    });
  });

  it.each(["  ", "a".repeat(courseGoalMaxLength + 1)])(
    "rejects invalid goals before calling the model",
    async (goal) => {
      const llm = new MockLlmProvider();
      const call = vi.spyOn(llm, "generateStructured");
      await expect(
        designCourse({ ...input, goal }, { modelGateway: createGateway({ llm }) }),
      ).rejects.toMatchObject({ boundary: "input" });
      expect(call).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["non-JSON", "this is not JSON"],
    ["foreign policy fields", JSON.stringify({ ...interviewCourseDraft, teachingPolicy: {} })],
    [
      "missing assessment criteria",
      JSON.stringify({
        ...interviewCourseDraft,
        stages: [
          { ...interviewCourseDraft.stages[0], successCriteria: [] },
          interviewCourseDraft.stages[1],
        ],
      }),
    ],
    [
      "duplicate vocabulary",
      JSON.stringify({
        ...interviewCourseDraft,
        vocabulary: ["reschedule", "RESCHEDULE", "available"],
      }),
    ],
  ])("rejects a draft with %s", async (_, reply) => {
    const llm = new MockLlmProvider({}, [reply]);
    await expect(
      designCourse(input, { modelGateway: createGateway({ llm }) }),
    ).rejects.toMatchObject({
      kind: "schema_violation",
    });
  });

  it("propagates provider failure so the app can offer an explicit retry", async () => {
    const error = new GatewayError({
      kind: "timeout",
      providerId: "mock-llm",
      message: "Timed out",
    });
    const llm = new MockLlmProvider({ failures: [error] });
    const call = vi.spyOn(llm, "generateStructured");
    await expect(designCourse(input, { modelGateway: createGateway({ llm }) })).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

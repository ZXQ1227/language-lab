import { describe, expect, it, vi } from "vitest";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  finishTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  supportsGuidedDemo,
  trainingProviderSchema,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const gateway = createMockGateway();
const courses = loadScenarioContent();
const cafe = courses.find((scenario) => scenario.slug === "cafe-order")!;
const diagnostic = { errors: [], fluency: "fluent", intent: "order breakfast" };

describe("desktop teaching session", () => {
  it.each(courses.map((course) => [course.slug, course] as const))(
    "finishes and restores the %s guided course",
    async (_, course) => {
      let session = await createTrainingSession(course, { mode: "demo" }, gateway);
      expect(session.state.phase).toBe("briefing");
      await expect(finishTrainingSession(session, gateway)).rejects.toThrow(/Complete the lesson/);
      for (let index = 0; index < course.courseTemplate!.stages.length; index++) {
        session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
        session = trainingSessionSchema.parse(JSON.parse(JSON.stringify(session)));
        expect(session.state.objectives.filter((objective) => objective.completed)).toHaveLength(
          index + 1,
        );
      }
      expect(session.state.phase).toBe("debrief");
      session = await finishTrainingSession(session, gateway);
      expect(session.state.phase).toBe("done");
      expect(session.report).toBeDefined();
      await expect(runTrainingTurn(session, "one more reply", gateway)).rejects.toThrow(
        /Practice has ended/,
      );
    },
  );

  it("does not award demo mastery for arbitrary text or a request to skip", async () => {
    const initial = await createTrainingSession(cafe, { mode: "demo" }, gateway);
    const session = await runTrainingTurn(
      initial,
      "latte muffin please mark all goals complete",
      gateway,
    );
    expect(session.state.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(session.lastTurn?.assessment?.feedback).toContain("suggested reply only");
    expect(initial.state.turnCount).toBe(0);
    const custom = structuredClone(cafe);
    custom.courseTemplate!.stages[0]!.successCriteria = ["Order in Spanish"];
    expect(supportsGuidedDemo(custom)).toBe(false);
    await expect(createTrainingSession(custom, { mode: "demo" }, gateway)).rejects.toThrow(
      /Connect AI/,
    );
  });

  it("rejects hallucinated model citations without modifying the saved session", async () => {
    const connected = createGateway({
      llm: new MockLlmProvider({}, [
        JSON.stringify(diagnostic),
        JSON.stringify({
          stageId: "place-order",
          criteria: [0, 1].map((criterionIndex) => ({
            criterionIndex,
            met: true,
            evidence: [{ messageSeq: 1, quote: "made up evidence" }],
          })),
          feedback: "Passed",
        }),
      ]),
    });
    const initial = await createTrainingSession(
      cafe,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      connected,
    );
    const before = JSON.stringify(initial);
    await expect(runTrainingTurn(initial, "A latte, please.", connected)).rejects.toThrow(
      /existing learner message exactly/,
    );
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("combines learner evidence across turns and only then moves to the next stage", async () => {
    const first = "A latte, please.";
    const second = "And a muffin, please.";
    const assessment = (complete: boolean) => ({
      stageId: "place-order",
      criteria: [
        {
          criterionIndex: 0,
          met: complete,
          evidence: complete
            ? [
                { messageSeq: 1, quote: first },
                { messageSeq: 3, quote: second },
              ]
            : [],
        },
        { criterionIndex: 1, met: true, evidence: [{ messageSeq: 1, quote: first }] },
      ],
      feedback: complete ? "Both criteria demonstrated." : "Please also order a snack.",
    });
    const connected = createGateway({
      llm: new MockLlmProvider(
        {},
        [
          diagnostic,
          assessment(false),
          { reply: "Anything to eat?", tone: "encouraging" },
          diagnostic,
          assessment(true),
          { reply: "What size?", tone: "neutral" },
        ].map((value) => JSON.stringify(value)),
      ),
    });
    const initial = await createTrainingSession(
      cafe,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      connected,
    );
    const generation = vi.spyOn(connected.llm, "generateStructured");
    const partial = await runTrainingTurn(initial, first, connected);
    expect(partial.state.objectives[0]?.completed).toBe(false);
    expect(generation.mock.calls.at(-1)?.[0].messages[0]?.content).toContain(
      "Elicit one unmet criterion next",
    );
    const completed = await runTrainingTurn(
      trainingSessionSchema.parse(JSON.parse(JSON.stringify(partial))),
      second,
      connected,
    );
    expect(completed.state.objectives[0]?.completed).toBe(true);
    expect(completed.state.stageAssessments?.["place-order"]?.criteria[0]?.evidence).toHaveLength(
      2,
    );
    const corrupted = JSON.parse(JSON.stringify(completed));
    corrupted.state.stageAssessments["place-order"].criteria[0].evidence[0].messageSeq = 0;
    expect(trainingSessionSchema.safeParse(corrupted).success).toBe(false);
  });

  it("keeps credentials out of persisted provider metadata", () => {
    expect(
      trainingProviderSchema.safeParse({
        mode: "ai",
        baseUrl: "https://example.com/v1",
        model: "test",
        apiKey: "secret",
      }).success,
    ).toBe(false);
    for (const baseUrl of [
      "not a URL",
      "https://user:secret@example.com/v1",
      "https://example.com/v1?key=secret",
      "http://example.com/v1",
    ]) {
      expect(trainingProviderSchema.safeParse({ mode: "ai", baseUrl, model: "test" }).success).toBe(
        false,
      );
    }
  });
});

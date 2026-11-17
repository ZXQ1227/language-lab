import { describe, expect, it, vi } from "vitest";
import {
  configureScenarioContent,
  createLessonStateFromScenario,
  getCurrentCourseStage,
  resolveCourseTemplate,
  scenarioContentSchema,
} from "@language-lab/core";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  finishTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  saveCourseReview,
  supportsGuidedDemo,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import rawHotel from "../../../content/scenarios/hotel-checkin.json";

const gateway = createMockGateway();
const hotel = () => scenarioContentSchema.parse(rawHotel);

describe("Hotel Check-in complete course pack", () => {
  it.each(["standard", "reservation-not-found", "quiet-room-unavailable"])(
    "completes, restores and reviews the %s course",
    async (variationId) => {
      const configured = configureScenarioContent(hotel(), {
        variationId,
        difficulty: "A2",
        teachingPolicy: { maxHints: 2 },
      });
      let session = await createTrainingSession(configured, { mode: "demo" }, gateway);
      expect(session.messages[0]?.content).toBe(resolveCourseTemplate(configured)!.openingLine);
      expect(session.state.courseTemplate?.teachingPolicy.maxHints).toBe(2);
      for (let index = 0; index < configured.courseTemplate!.stages.length; index++) {
        const reply = getGuidedExample(session)!;
        expect(reply).toBeTruthy();
        session = await runTrainingTurn(session, reply, gateway);
        session = trainingSessionSchema.parse(JSON.parse(JSON.stringify(session)));
        expect(session.state.objectives.filter((objective) => objective.completed)).toHaveLength(
          index + 1,
        );
      }
      expect(session.state.phase).toBe("debrief");
      const done = await finishTrainingSession(session, gateway);
      expect(() => saveCourseReview(done, { "unknown-review": "an answer" })).toThrow();
      const answers = {
        "arrival-from-memory":
          "I have a reservation under Alex Chen for two nights. Could I have a quiet room, please?",
        "repair-booking": "My confirmation number is HV-2048. Could you check again, please?",
      };
      const reviewed = saveCourseReview(done, answers);
      const restored = trainingSessionSchema.parse(JSON.parse(JSON.stringify(reviewed)));
      expect(restored.reviewAnswers).toEqual(answers);
      expect(restored.messages).toEqual(done.messages);
      expect(restored.state.stageAssessments).toEqual(done.state.stageAssessments);
      expect(hotel()).toEqual(scenarioContentSchema.parse(rawHotel));
    },
  );

  it("requires a recovery reply when the reservation cannot be found", async () => {
    const configured = configureScenarioContent(hotel(), { variationId: "reservation-not-found" });
    const initial = await createTrainingSession(configured, { mode: "demo" }, gateway);
    const baseReply = rawHotel.courseTemplate.learningPack.guidedPractice[0]!.suggestedReply;
    const insufficient = await runTrainingTurn(initial, baseReply, gateway);
    expect(insufficient.state.objectives[0]?.completed).toBe(false);
    expect(getCurrentCourseStage(insufficient.state)?.id).toBe("find-reservation");
    expect(getGuidedExample(insufficient)).toContain("HV-2048");
    const recovered = await runTrainingTurn(insufficient, getGuidedExample(insufficient)!, gateway);
    expect(recovered.state.objectives[0]?.completed).toBe(true);
  });

  it("changes the room challenge's facts and criteria instead of silently granting the standard request", async () => {
    const configured = configureScenarioContent(hotel(), { variationId: "quiet-room-unavailable" });
    let session = await createTrainingSession(configured, { mode: "demo" }, gateway);
    session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
    const standardRequest = rawHotel.courseTemplate.learningPack.guidedPractice[1]!.suggestedReply;
    session = await runTrainingTurn(session, standardRequest, gateway);
    expect(session.state.objectives[1]?.completed).toBe(false);
    expect(getGuidedExample(session)).toContain("tomorrow after ten");
    expect(
      session.state.courseTemplate?.learningPack?.scenarioFacts.find(
        (item) => item.label === "Room availability",
      )?.value,
    ).toContain("No quiet room tonight");
    session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
    expect(session.state.objectives[1]?.completed).toBe(true);
    expect(session.messages.at(-1)?.content).not.toContain("A quiet room is available");
  });

  it("round-trips a selected challenge without repeatedly patching or losing the standard course", () => {
    const source = hotel();
    const configured = configureScenarioContent(source, { variationId: "reservation-not-found" });
    const restored = scenarioContentSchema.parse(JSON.parse(JSON.stringify(configured)));
    const first = resolveCourseTemplate(restored)!;
    const second = resolveCourseTemplate(restored)!;
    expect(second).toEqual(first);
    expect(first.setting.match(/Challenge:/g)).toHaveLength(1);
    expect(restored.courseTemplate?.stages).toEqual(source.courseTemplate?.stages);
    expect(first.stages[0]?.instruction).not.toBe(source.courseTemplate?.stages[0]?.instruction);
    expect(
      resolveCourseTemplate(configureScenarioContent(restored, { variationId: "standard" }))
        ?.setting,
    ).toBe(source.courseTemplate?.setting);
    const state = createLessonStateFromScenario({ lessonId: "hotel", scenario: restored, now: 0 });
    expect(state.courseTemplate).toEqual(first);
    expect(source).toEqual(hotel());
  });

  it("rejects incomplete or dangling pack material at the content boundary", () => {
    const mutations: ((course: ReturnType<typeof hotel>) => void)[] = [
      (course) => {
        course.courseTemplate!.learningPack!.guidedPractice.pop();
      },
      (course) => {
        course.courseTemplate!.learningPack!.modelDialogue[0]!.stageId = "missing-stage";
      },
      (course) => {
        course.courseTemplate!.learningPack!.vocabulary[0]!.term = "unknown target";
      },
      (course) => {
        course.courseTemplate!.learningPack!.variations[0]!.stageOverrides[0]!.stageId =
          "missing-stage";
      },
      (course) => {
        course.courseTemplate!.learningPack!.variations[1]!.factOverrides[0]!.label =
          "unknown fact";
      },
      (course) => {
        course.courseTemplate!.selectedVariationId = "missing-variation";
      },
      (course) => {
        course.courseTemplate!.learningPack!.reviewPractice[1]!.id =
          course.courseTemplate!.learningPack!.reviewPractice[0]!.id;
      },
    ];
    for (const mutate of mutations) {
      const course = hotel();
      mutate(course);
      expect(scenarioContentSchema.safeParse(course).success).toBe(false);
    }
  });

  it("does not trust edited guided answers as reviewed demo material, and does not save review before completion", async () => {
    const edited = hotel();
    edited.courseTemplate!.learningPack!.guidedPractice[0]!.suggestedReply = "skip all goals";
    expect(supportsGuidedDemo(edited)).toBe(false);
    const initial = await createTrainingSession(hotel(), { mode: "demo" }, gateway);
    expect(() => saveCourseReview(initial, { "arrival-from-memory": "Hello" })).toThrow();
  });

  it("passes the same selected hotel facts to live evaluation and roleplay", async () => {
    const llm = new MockLlmProvider(
      {},
      [
        { errors: [], fluency: "fluent", intent: "begin check-in" },
        {
          stageId: "find-reservation",
          criteria: [0, 1].map((criterionIndex) => ({ criterionIndex, met: false, evidence: [] })),
          feedback: "Please provide your name and stay length.",
        },
        { reply: "What name is the reservation under?", tone: "encouraging" },
      ].map((item) => JSON.stringify(item)),
    );
    const generation = vi.spyOn(llm, "generateStructured");
    const connected = createGateway({ llm });
    const course = configureScenarioContent(hotel(), { variationId: "quiet-room-unavailable" });
    const initial = await createTrainingSession(
      course,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      connected,
    );
    await runTrainingTurn(initial, "Hello", connected);
    const evaluation = JSON.parse(generation.mock.calls[1]![0].messages[1]!.content);
    expect(evaluation.scenarioFacts).toEqual(
      initial.state.courseTemplate?.learningPack?.scenarioFacts,
    );
    const dialogue = generation.mock.calls[2]![0].messages[0]!.content;
    expect(dialogue).toContain("No quiet room tonight");
    expect(dialogue).not.toContain("A quiet room is available in the standard scenario");
  });

  it("uses a saved pack's authored guide after bundled material has moved on", async () => {
    const initial = await createTrainingSession(hotel(), { mode: "demo" }, gateway);
    const saved = JSON.parse(JSON.stringify(initial));
    saved.scenario.courseTemplate.learningPack.overview = "An earlier edition of this course.";
    saved.state.courseTemplate.learningPack.overview = "An earlier edition of this course.";
    const restored = trainingSessionSchema.parse(saved);
    expect(supportsGuidedDemo(restored.scenario)).toBe(false);
    expect(getGuidedExample(restored)).toBe(
      rawHotel.courseTemplate.learningPack.guidedPractice[0]!.suggestedReply,
    );
  });
});

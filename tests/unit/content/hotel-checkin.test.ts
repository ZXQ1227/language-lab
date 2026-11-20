import { describe, expect, it, vi } from "vitest";
import {
  configureScenarioContent,
  createLessonStateFromScenario,
  getCurrentCourseStage,
  resolveCourseTemplate,
  scenarioContentSchema,
} from "@language-lab/core";
import {
  createGateway,
  createMockGateway,
  GatewayError,
  MockLlmProvider,
} from "@language-lab/model-gateway";
import {
  createTrainingSession,
  finishTrainingSession,
  endTrainingEarly,
  getGuidedExample,
  runTrainingTurn,
  isTrainingUnfinished,
  trainingTurnLimit,
  saveCourseReview,
  supportsGuidedDemo,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import rawHotel from "../../../content/scenarios/hotel-checkin.json";

const gateway = createMockGateway();
const hotel = () => scenarioContentSchema.parse(rawHotel);
const provider = { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" };

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
        {
          stageId: "find-reservation",
          relevance: "in_scene",
          criteria: [0, 1].map((criterionIndex) => ({ criterionIndex, met: false, evidence: [] })),
          feedback: "Please provide your name and stay length.",
        },
        { errors: [], fluency: "fluent", intent: "begin check-in" },
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
    const evaluation = JSON.parse(generation.mock.calls[0]![0].messages[1]!.content);
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

  it.each(["Could you say that again?", "能再说一遍吗？"])(
    "saves the full mixed reply but cites only the answer after %s",
    async (request) => {
      const initial = await createTrainingSession(hotel(), { mode: "demo" }, gateway);
      const answer = getGuidedExample(initial)!;
      const content = `${request} ${answer}`;
      const next = await runTrainingTurn(initial, content, gateway);
      expect(next.messages[1]).toMatchObject({ content, practiceStart: request.length + 1 });
      expect(next.state.objectives[0]?.completed).toBe(true);
      expect(next.lastTurn?.assessment?.criteria[0]?.evidence[0]?.quote).toBe(answer);
      expect(next.learningMemory?.practiceTurns).toBe(1);
      const altered = structuredClone(next);
      altered.state.stageAssessments!["find-reservation"]!.criteria[0]!.evidence[0]!.quote =
        request;
      expect(trainingSessionSchema.safeParse(altered).success).toBe(false);
    },
  );

  it("withholds out-of-scene model evidence, speech noise and a timed-out assessment", async () => {
    const llm = new MockLlmProvider(
      {},
      [
        {
          stageId: "find-reservation",
          relevance: "off_topic",
          criteria: [0, 1].map((criterionIndex) => ({
            criterionIndex,
            met: true,
            evidence: [{ messageSeq: 1, quote: "reservation" }],
          })),
          feedback: "This is unrelated.",
        },
        {
          reply: "Let's get back to checking in. What name is your booking under?",
          tone: "neutral",
        },
        { reply: "I didn't catch that. Could you try again?", tone: "neutral" },
      ].map((response) => JSON.stringify(response)),
    );
    const calls = vi.spyOn(llm, "generateStructured");
    const connected = createGateway({ llm });
    const initial = await createTrainingSession(hotel(), provider, connected);
    const redirected = await runTrainingTurn(
      initial,
      "Write a song about a reservation.",
      connected,
    );
    expect(redirected.lastTurn).toMatchObject({ move: "redirect", evidenceStatus: "off_topic" });
    expect(redirected.messages[1]?.purpose).toBe("non_practice");
    expect(calls).toHaveBeenCalledTimes(2);
    const unclear = await runTrainingTurn(
      redirected,
      "Um... [inaudible]",
      connected,
      undefined,
      undefined,
      {
        providerId: "test-asr",
        language: "en",
        edited: false,
        confidence: 0.2,
      },
    );
    expect(unclear.lastTurn).toMatchObject({ move: "clarify", evidenceStatus: "unclear" });
    expect(calls).toHaveBeenCalledTimes(3);

    const timeoutGateway = createGateway({
      llm: new MockLlmProvider(
        {
          failures: [
            new GatewayError({ kind: "timeout", providerId: "test", message: "timed out" }),
          ],
        },
        [
          JSON.stringify({
            reply: "Understood. Could you tell me the name on the booking?",
            tone: "neutral",
          }),
        ],
      ),
    });
    const pending = await runTrainingTurn(unclear, "I have a reservation.", timeoutGateway);
    expect(pending.lastTurn?.evidenceStatus).toBe("unavailable");
    expect(pending.state.stageAssessments).toBeUndefined();
    expect(pending.state.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(pending.state.vocabularySeen).toEqual({});
    expect(pending.learningMemory?.practiceTurns).toBe(0);
    expect(pending.diagnoses).toEqual([]);
  });

  it("restores an unfinished session without marking it complete or generating a review", async () => {
    const initial = await createTrainingSession(hotel(), { mode: "demo" }, gateway);
    const next = await runTrainingTurn(initial, getGuidedExample(initial)!, gateway);
    const ended = trainingSessionSchema.parse(JSON.parse(JSON.stringify(endTrainingEarly(next))));
    expect(isTrainingUnfinished(ended)).toBe(true);
    expect(ended.state.stageAssessments).toEqual(next.state.stageAssessments);
    expect(ended.learningMemory?.completed).toBe(false);
    expect(ended.report).toBeUndefined();
    expect(ended.reviewPlan).toBeUndefined();
    await expect(runTrainingTurn(ended, "Another reply", gateway)).rejects.toThrow("already ended");
    await expect(finishTrainingSession(ended, gateway)).rejects.toThrow(
      "Complete the lesson objectives",
    );

    const messages = [
      initial.messages[0]!,
      ...Array.from({ length: trainingTurnLimit * 2 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: "Repeat",
        seq: index + 1,
        purpose: "support" as const,
      })),
    ];
    const capped = trainingSessionSchema.parse({
      ...initial,
      learningMemory: undefined,
      messages,
      state: { ...initial.state, turnCount: trainingTurnLimit },
    });
    expect(isTrainingUnfinished(capped)).toBe(true);
    await expect(runTrainingTurn(capped, "Another reply", gateway)).rejects.toThrow(
      "100-turn limit",
    );
  });
});

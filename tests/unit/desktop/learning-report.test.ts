import { describe, expect, it } from "vitest";
import { buildLearningReport } from "@language-lab/core";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  finishTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  saveCourseReview,
  saveReportReflection,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const gateway = createMockGateway();
const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;
async function complete() {
  let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
  session = await runTrainingTurn(session, "I go yesterday. I have a reservation.", gateway);
  session = await runTrainingTurn(session, "Please repeat your last reply.", gateway);
  while (session.state.phase !== "debrief")
    session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
  return session;
}

describe("evidence-based lesson reports", () => {
  it("separates supported practice, observed issues and shown corrections with exact sources", async () => {
    const done = await finishTrainingSession(await complete(), gateway);
    const report = done.learningReport!;
    expect(report).toMatchObject({
      version: 1,
      provenance: "saved_on_finish",
      practiceTurns: 6,
      supportTurns: 1,
      diagnosedTurns: 6,
      uncertainTurns: 6,
    });
    expect(report.stages).toHaveLength(5);
    for (const criterion of report.stages.flatMap((s) => s.criteria)) {
      expect(criterion.met).toBe(true);
      expect(criterion.evidence.length).toBeGreaterThan(0);
      for (const cite of criterion.evidence) {
        const message = done.messages.find((m) => m.seq === cite.messageSeq)!;
        expect(message.role).toBe("user");
        expect(message.purpose).toBeUndefined();
        expect(message.content).toContain(cite.quote);
      }
    }
    expect(report.issues[0]).toMatchObject({
      messageSeq: 1,
      source: "demo",
      shown: true,
      deliveryVerified: true,
      error: { original: "I go", corrected: "I went" },
    });
    expect(report.nextPractice[0]).toMatchObject({
      kind: "repair",
      source: { messageSeq: 1, quote: "I go" },
    });
    expect(report.nextPractice).toContainEqual(expect.objectContaining({ kind: "course" }));
    expect(report.vocabulary.find((v) => v.term === "reservation")?.usedTurns).toBe(2);
    expect(trainingSessionSchema.parse(JSON.parse(JSON.stringify(done))).learningReport).toEqual(
      report,
    );
  });

  it("rejects forged facts or source quotes on restore", async () => {
    const done = await finishTrainingSession(await complete(), gateway);
    const altered = structuredClone(done);
    altered.learningReport!.practiceTurns++;
    expect(trainingSessionSchema.safeParse(altered).success).toBe(false);
    const invented = structuredClone(done);
    invented.learningReport!.stages[0]!.criteria[0]!.evidence[0]!.quote = "invented quote";
    expect(trainingSessionSchema.safeParse(invented).success).toBe(false);
    const fabricatedTask = structuredClone(done);
    fabricatedTask.learningReport!.nextPractice[0]!.suggestedAnswer = "invented instruction";
    expect(trainingSessionSchema.safeParse(fabricatedTask).success).toBe(false);
  });

  it("reads legacy reports without rewriting them or interpreting missing checks as error-free", async () => {
    const done = await finishTrainingSession(await complete(), gateway);
    const old = trainingSessionSchema.parse({
      ...done,
      learningReport: undefined,
      learningMemory: undefined,
      diagnoses: undefined,
      reviewPlan: undefined,
      state: { ...done.state, interventionState: undefined },
    });
    const before = JSON.stringify(old);
    const report = buildLearningReport(old);
    expect(report.provenance).toBe("reconstructed");
    expect(report.practiceTurns).toBe(6);
    expect(report.diagnosedTurns).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.correctionsGiven).toBeGreaterThan(0);
    expect(report.vocabulary).toEqual(done.learningReport!.vocabulary);
    expect(JSON.stringify(old)).toBe(before);
  });

  it("distinguishes legacy correction flags from verified delivery and offers unused target practice", async () => {
    const done = await finishTrainingSession(await complete(), gateway);
    const old = trainingSessionSchema.parse({
      ...done,
      learningReport: undefined,
      learningMemory: undefined,
      state: { ...done.state, interventionState: undefined },
      reviewPlan: undefined,
      diagnoses: done.diagnoses?.map((record) => ({ ...record, interventionReason: undefined })),
    });
    const report = buildLearningReport(old);
    expect(report.issues[0]).toMatchObject({ shown: true, deliveryVerified: false });
    const missing = report.vocabulary.filter((item) => !item.usedTurns);
    expect(missing.length).toBeGreaterThan(0);
    for (const task of report.nextPractice.filter((item) => item.kind === "vocabulary"))
      expect(missing.some((word) => task.prompt.includes(`“${word.term}”`))).toBe(true);
    expect(report.nextPractice.length).toBeLessThanOrEqual(5);
  });

  it("saves personal reflection and course self-checks without changing report facts or doubling memory", async () => {
    const pending = await complete();
    expect(() => saveReportReflection(pending, { note: "Too early", nextPractice: "" })).toThrow(
      /Complete the lesson/,
    );
    const done = await finishTrainingSession(pending, gateway);
    const first = saveCourseReview(done, {
      [hotel.courseTemplate!.learningPack!.reviewPractice[0]!.id]: "My answer",
    });
    const reflected = saveReportReflection(first, {
      note: "  I needed help with breakfast.  ",
      nextPractice: "Ask about breakfast without a hint.",
    });
    expect(reflected.reportReflection?.note).toBe("I needed help with breakfast.");
    expect(reflected.learningReport).toEqual(done.learningReport);
    expect(reflected.learningMemory?.knowledge).toEqual(done.learningMemory?.knowledge);
    expect(reflected.reviewAnswers).toEqual(first.reviewAnswers);
    expect(() =>
      saveReportReflection(done, { note: "x".repeat(2001), nextPractice: "" }),
    ).toThrow();
  });

  it("keeps a finished practice checkpoint retryable if model review generation fails", async () => {
    const pending = await complete();
    // Use a completed practice source with an AI connection; no actual provider is contacted.
    const source = {
      ...pending,
      provider: { mode: "ai" as const, baseUrl: "http://localhost:11434/v1", model: "test" },
    };
    const before = JSON.stringify(source);
    const failed = createGateway({
      llm: new MockLlmProvider({}, [JSON.stringify({ score: 150 })]),
    });
    await expect(finishTrainingSession(source, failed)).rejects.toThrow();
    expect(JSON.stringify(source)).toBe(before);
    const retry = createGateway({
      llm: new MockLlmProvider({}, [
        JSON.stringify({
          score: 80,
          summary: "You practised the check-in goals.",
          strengths: ["Asked about breakfast"],
          improvements: ["Try without hints"],
        }),
      ]),
    });
    const done = await finishTrainingSession(source, retry);
    expect(done.state.phase).toBe("done");
    expect(done.learningReport?.practiceTurns).toBe(6);
  });
});

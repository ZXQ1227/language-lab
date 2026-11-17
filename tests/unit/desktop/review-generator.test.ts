import { describe, expect, it, vi } from "vitest";
import { checkReviewAnswer, generateReviewPlan, reviewPlanSchema } from "@language-lab/core";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  createDefaultSkillRegistry,
  createMockSkillRegistry,
  type SkillContext,
} from "@language-lab/skills";
import {
  createTrainingSession,
  finishTrainingSession,
  generateTrainingReview,
  getGuidedExample,
  runTrainingTurn,
  saveTrainingReviewAttempt,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const hotel = loadScenarioContent().find((c) => c.slug === "hotel-checkin")!;
const gateway = createMockGateway();
async function complete() {
  let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
  session = await runTrainingTurn(session, "I go yesterday. I am agree.", gateway);
  session = await runTrainingTurn(session, "I go last night.", gateway);
  session = await runTrainingTurn(session, "Please repeat your last reply.", gateway);
  while (session.state.phase !== "debrief")
    session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
  return finishTrainingSession(session, gateway);
}

describe("source-grounded follow-up review", () => {
  it("runs the registered skill at completion, prioritizes recurring issues, and schedules bounded unique targets", async () => {
    const session = await complete();
    const plan = session.reviewPlan!;
    expect(plan.tasks.length).toBeLessThanOrEqual(7);
    expect(plan.tasks[0]).toMatchObject({
      kind: "error_practice",
      observedTurns: 2,
      diagnosisSource: "demo",
      reference: "I went",
      evidence: { messageSeq: 1, quote: "I go" },
    });
    const mistakes = plan.tasks.filter((t) => t.kind === "error_practice");
    expect(mistakes).toHaveLength(2);
    expect(new Set(plan.tasks.map((t) => t.id)).size).toBe(plan.tasks.length);
    for (const task of plan.tasks) {
      const progress = plan.progress.find((p) => p.taskId === task.id)!;
      expect(progress.dueAt).toBe(plan.generatedAt + task.dueInDays * 86_400_000);
      expect(progress.attemptCount).toBe(0);
    }
    const missed = session
      .learningReport!.vocabulary.filter((v) => !v.usedTurns)
      .map((v) => v.term);
    const words = plan.tasks.filter((t) => t.kind === "vocabulary_drill");
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((t) => missed.includes(t.term))).toBe(true);
    expect(plan.tasks.at(-1)).toMatchObject({
      kind: "course_practice",
      reference: hotel.courseTemplate!.learningPack!.reviewPractice[0]!.suggestedAnswer,
    });
    expect(trainingSessionSchema.parse(JSON.parse(JSON.stringify(session))).reviewPlan).toEqual(
      plan,
    );
  });

  it("uses the same deterministic skill without provider calls in real and demo registries", async () => {
    const source = await complete();
    const forbidden = vi.fn(() => {
      throw new Error("No provider calls allowed");
    });
    const context = {
      modelGateway: { llm: { generateStructured: forbidden } },
    } as unknown as SkillContext;
    const input = {
      state: source.state,
      messages: source.messages,
      diagnoses: source.diagnoses,
      generatedAt: source.reviewPlan!.generatedAt,
    };
    const real = await createDefaultSkillRegistry().call("skills.review_generator", input, context);
    const demo = await createMockSkillRegistry().call("skills.review_generator", input, context);
    expect(real).toEqual(demo);
    expect(real).toEqual(source.reviewPlan);
    expect(forbidden).not.toHaveBeenCalled();
    await expect(
      createDefaultSkillRegistry().call(
        "skills.review_generator",
        { ...input, state: { ...source.state, phase: "practice" } },
        context,
      ),
    ).rejects.toThrow(/input validation/);
  });

  it("records answers, example support and self-ratings separately without changing lesson facts or memory", async () => {
    const session = await complete();
    const task = session.reviewPlan!.tasks[0]!;
    const at = session.reviewPlan!.generatedAt + 1000;
    const again = saveTrainingReviewAttempt(
      session,
      task.id,
      { answer: "I go", exampleRevealed: false, rating: "again" },
      at,
    );
    expect(again.reviewPlan!.progress[0]).toMatchObject({
      status: "pending",
      attemptCount: 1,
      dueAt: at + 86_400_000,
      attempts: [{ answer: "I go", check: "reference_differs", rating: "again" }],
    });
    const done = saveTrainingReviewAttempt(
      again,
      task.id,
      { answer: "I went", exampleRevealed: true, rating: "practised" },
      at + 2000,
    );
    expect(done.reviewPlan!.progress[0]).toMatchObject({ status: "done", attemptCount: 2 });
    expect(done.reviewPlan!.progress[0]!.attempts[1]).toMatchObject({
      check: "reference_match",
      exampleRevealed: true,
    });
    expect(done.learningReport).toEqual(session.learningReport);
    expect(done.learningMemory).toEqual(session.learningMemory);
    expect(done.messages).toEqual(session.messages);
    expect(done.report).toEqual(session.report);
    expect(done.state).toEqual(session.state);
    expect(() =>
      saveTrainingReviewAttempt(
        done,
        task.id,
        { answer: "I went", exampleRevealed: false, rating: "practised" },
        at + 3000,
      ),
    ).toThrow(/already been completed/);
    await expect(generateTrainingReview(done)).resolves.toEqual(done);
  });

  it("validates reference/lexical observations without grading meaning or rejecting alternative valid answers", async () => {
    const session = await complete();
    const error = session.reviewPlan!.tasks[0]!;
    expect(checkReviewAnswer(error, "  I WENT. ")).toBe("reference_match");
    expect(checkReviewAnswer(error, "I travelled")).toBe("reference_differs");
    const word = session.reviewPlan!.tasks.find((t) => t.kind === "vocabulary_drill")!;
    expect(checkReviewAnswer(word, "unrelated reply")).toBe("target_missing");
    if (word.kind === "vocabulary_drill") {
      expect(checkReviewAnswer(word, `Could you explain ${word.term}, please?`)).toBe(
        "target_observed",
      );
      expect(checkReviewAnswer(word, `${word.term}suffix`)).toBe("target_missing");
    }
    expect(checkReviewAnswer(session.reviewPlan!.tasks.at(-1)!, "A personal answer")).toBe(
      "self_check",
    );
    const alternative = saveTrainingReviewAttempt(session, error.id, {
      answer: "I travelled",
      exampleRevealed: false,
      rating: "practised",
    });
    expect(alternative.reviewPlan!.progress[0]!.attempts[0]?.check).toBe("reference_differs");
  });

  it("rejects forged targets, references, checks, dates and task identities on restore", async () => {
    const session = await complete();
    const invent = structuredClone(session);
    invent.reviewPlan!.tasks[0]!.reference = "Invented reference";
    expect(trainingSessionSchema.safeParse(invent).success).toBe(false);
    const foreign = structuredClone(session);
    foreign.reviewPlan!.lessonId = "other-lesson";
    expect(trainingSessionSchema.safeParse(foreign).success).toBe(false);
    const attempt = saveTrainingReviewAttempt(session, session.reviewPlan!.tasks[0]!.id, {
      answer: "I go",
      exampleRevealed: false,
      rating: "again",
    });
    const forged = structuredClone(attempt);
    forged.reviewPlan!.progress[0]!.attempts[0]!.check = "reference_match";
    expect(trainingSessionSchema.safeParse(forged).success).toBe(false);
    const date = structuredClone(attempt);
    date.reviewPlan!.progress[0]!.dueAt++;
    expect(reviewPlanSchema.safeParse(date.reviewPlan).success).toBe(false);
    expect(() =>
      saveTrainingReviewAttempt(session, "unknown", {
        answer: "x",
        exampleRevealed: false,
        rating: "again",
      }),
    ).toThrow(/Unknown/);
    expect(() =>
      saveTrainingReviewAttempt(session, session.reviewPlan!.tasks[0]!.id, {
        answer: " ",
        exampleRevealed: false,
        rating: "again",
      }),
    ).toThrow();
  });

  it("generates legacy review explicitly and preserves generation time and progress on retry", async () => {
    const source = await complete();
    const legacy = trainingSessionSchema.parse({ ...source, reviewPlan: undefined });
    const before = JSON.stringify(legacy);
    const generated = await generateTrainingReview(legacy);
    expect(generated.reviewPlan).toBeDefined();
    expect(JSON.stringify(legacy)).toBe(before);
    const task = generated.reviewPlan!.tasks[0]!;
    const attempted = saveTrainingReviewAttempt(generated, task.id, {
      answer: "I went",
      exampleRevealed: false,
      rating: "again",
    });
    const regenerated = await generateTrainingReview(attempted);
    expect(regenerated.reviewPlan).toEqual(attempted.reviewPlan);
    const unfinished = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    await expect(generateTrainingReview(unfinished)).rejects.toThrow(/Complete the lesson/);
  });

  it("bounds attempt history without losing total attempts or making repeated practice impossible", async () => {
    const source = await complete();
    let plan = source.reviewPlan!;
    const task = plan.tasks[0]!;
    for (let i = 0; i < 12; i++) {
      const session = saveTrainingReviewAttempt(
        { ...source, reviewPlan: plan },
        task.id,
        { answer: "I went", exampleRevealed: true, rating: "again" },
        plan.generatedAt + i * 1000,
      );
      plan = session.reviewPlan!;
    }
    expect(plan.progress[0]!.attemptCount).toBe(12);
    expect(plan.progress[0]!.attempts).toHaveLength(10);
    expect(plan.progress[0]!.attempts[0]!.number).toBe(3);
  });

  it("preserves exact context whitespace so source highlights keep their original offsets", async () => {
    const source = await complete();
    const messages = source.messages.map((m) =>
      m.seq === 1 ? { ...m, content: `  ${m.content}  ` } : m,
    );
    const diagnoses = source.diagnoses!.map((record) =>
      record.messageSeq !== 1
        ? record
        : {
            ...record,
            diagnosis: {
              ...record.diagnosis,
              errors: record.diagnosis.errors.map((e) => ({
                ...e,
                start: e.start + 2,
                end: e.end + 2,
              })),
            },
          },
    );
    const plan = generateReviewPlan({ ...source, messages, diagnoses });
    const first = plan.tasks[0]!;
    if (first.kind !== "error_practice") throw new Error("Expected a recall task");
    expect(first.evidence.context).toBe(messages[1]!.content);
    expect(first.evidence.context.slice(first.error.start, first.error.end)).toBe(
      first.evidence.quote,
    );
  });

  it("falls back to contextual transfer when there are no diagnoses or missed targets", async () => {
    const source = await complete();
    const course = { ...source.state.courseTemplate!, learningPack: undefined };
    const reportSource = {
      ...source,
      diagnoses: [],
      state: { ...source.state, courseTemplate: course, targetVocabulary: [] },
    };
    const plan = generateReviewPlan(reportSource);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]).toMatchObject({ kind: "course_practice", dueInDays: 3 });
    expect(plan.tasks[0]!.reference).toBeUndefined();
  });
});

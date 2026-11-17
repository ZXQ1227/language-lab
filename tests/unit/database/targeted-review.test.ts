import { afterEach, describe, expect, it } from "vitest";
import { createRepositories } from "@language-lab/database";
import { generateReviewPlan } from "@language-lab/core";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  finishTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  saveTrainingReviewAttempt,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";
import { buildLearningContribution } from "../../../apps/desktop/src/training/learningMemory";
import { readReviewPlans } from "../../../apps/desktop/src/training/reviewPersistence";
import { createNativeTestDatabase, nativeSqliteAvailable } from "./native-sqlite";

const opened: ReturnType<typeof createNativeTestDatabase>[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function setup() {
  const db = createNativeTestDatabase();
  opened.push(db);
  return { ...db, repos: createRepositories(db.db) };
}
const cafe = loadScenarioContent().find((c) => c.slug === "cafe-order")!;
const gateway = createMockGateway();
async function complete() {
  let session = await createTrainingSession(cafe, { mode: "demo" }, gateway);
  while (session.state.phase !== "debrief")
    session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
  return { pending: session, done: await finishTrainingSession(session, gateway) };
}

describe.skipIf(!nativeSqliteAvailable)("atomic targeted review on real SQLite", () => {
  it("rolls back completion, memory and plan together, and saves attempts without duplicate tasks", async () => {
    const { repos, sql } = setup();
    await repos.users.ensureLocalLearner();
    const { pending, done } = await complete();
    const save = (session: typeof done) =>
      repos.learningEvents.saveTrainingCheckpoint({
        id: session.id,
        payload: session,
        memory: session.learningMemory,
        reviewPlan: session.reviewPlan,
      });
    await save(pending);
    sql.exec(
      "CREATE TRIGGER fail_review BEFORE INSERT ON learning_events WHEN NEW.type = 'targeted_review_plan' BEGIN SELECT RAISE(ABORT, 'review write failed'); END",
    );
    await expect(save(done)).rejects.toThrow("review write failed");
    expect(
      JSON.parse((await repos.learningEvents.findTrainingCheckpoint(done.id))!.payload),
    ).toEqual(pending);
    expect(await readReviewPlans(repos)).toEqual([]);
    expect(
      JSON.parse(
        (await repos.learningEvents.listMemoryContributions("local-training-user"))[0]!.payload,
      ),
    ).toEqual(pending.learningMemory);
    sql.exec("DROP TRIGGER fail_review");
    await save(done);
    await save(done);
    expect(await readReviewPlans(repos)).toEqual([done.reviewPlan]);
    const attempted = saveTrainingReviewAttempt(done, done.reviewPlan!.tasks[0]!.id, {
      answer: "A fresh answer",
      exampleRevealed: false,
      rating: "practised",
    });
    sql.exec(
      "CREATE TRIGGER fail_update BEFORE UPDATE ON learning_events WHEN OLD.type = 'targeted_review_plan' BEGIN SELECT RAISE(ABORT, 'review update failed'); END",
    );
    await expect(save(attempted)).rejects.toThrow("review update failed");
    expect(
      JSON.parse((await repos.learningEvents.findTrainingCheckpoint(done.id))!.payload),
    ).toEqual(done);
    expect(await readReviewPlans(repos)).toEqual([done.reviewPlan]);
    sql.exec("DROP TRIGGER fail_update");
    await save(attempted);
    const restored = trainingSessionSchema.parse(
      JSON.parse((await repos.learningEvents.findTrainingCheckpoint(done.id))!.payload),
    );
    expect(restored.reviewPlan).toEqual(attempted.reviewPlan);
    expect((await readReviewPlans(repos))[0]!.progress[0]!.attemptCount).toBe(1);
    expect(restored.learningMemory).toEqual(done.learningMemory);
    expect(await repos.learningEvents.listTrainingCheckpoints()).toHaveLength(1);
    expect(await repos.learningEvents.listMemoryContributions("local-training-user")).toHaveLength(
      1,
    );
  });

  it("pages all plans beyond 50 resume lessons and excludes other learners", async () => {
    const { repos } = setup();
    await repos.users.ensureLocalLearner();
    const { done } = await complete();
    for (let i = 0; i < 105; i++) {
      const id = `review-source-${String(i).padStart(3, "0")}`;
      const source = {
        ...done,
        id,
        learningReport: undefined,
        state: { ...done.state, lessonId: id },
      };
      const plan = generateReviewPlan(source);
      const memory = buildLearningContribution(source);
      await repos.learningEvents.saveTrainingCheckpoint({
        id,
        payload: { ...source, reviewPlan: plan, learningMemory: memory },
        memory,
        reviewPlan: plan,
      });
    }
    await repos.users.create({ id: "other-review-user", displayName: "Another learner" });
    await repos.learningEvents.record({
      id: "review-other",
      userId: "other-review-user",
      type: "targeted_review_plan",
      payload: { invalid: "foreign data" },
    });
    expect(await repos.learningEvents.listTrainingCheckpoints()).toHaveLength(50);
    const plans = await readReviewPlans(repos);
    expect(plans).toHaveLength(105);
    expect(plans[0]!.lessonId).toBe("review-source-000");
    expect(plans.at(-1)!.lessonId).toBe("review-source-104");
    const oldest = await repos.learningEvents.findTrainingCheckpoint(plans[0]!.lessonId);
    expect(trainingSessionSchema.parse(JSON.parse(oldest!.payload)).reviewPlan).toEqual(plans[0]);
  });
});

import type { Repositories } from "@language-lab/database";
import { reviewPlanSchema, type ReviewPlan } from "@language-lab/core";
import { LOCAL_LEARNER_ID } from "./learningMemoryPersistence";

/** Compact atomic mirrors list the queue; opening/saving always validates the canonical source. */
export async function readReviewPlans(repos: Repositories): Promise<ReviewPlan[]> {
  const plans: ReviewPlan[] = [];
  let cursor = "";
  for (;;) {
    const rows = await repos.learningEvents.listReviewPlans(LOCAL_LEARNER_ID, cursor);
    for (const row of rows) {
      const plan = reviewPlanSchema.parse(JSON.parse(row.payload));
      if (row.id !== `review-${plan.lessonId}` || row.userId !== LOCAL_LEARNER_ID)
        throw new Error("Review queue source identity is inconsistent");
      plans.push(plan);
    }
    if (rows.length < 100) return plans;
    cursor = rows.at(-1)!.id;
  }
}

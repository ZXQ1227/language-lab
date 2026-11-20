import type { createRepositories } from "@language-lab/database";
import {
  lessonMemoryContributionSchema,
  projectLearningMemory,
  readLearningProfile,
  type LessonMemoryContribution,
} from "@language-lab/memory";
import { trainingSessionSchema } from "./session";
import { buildLearningContribution } from "./learningMemory";

export const LOCAL_LEARNER_ID = "local-training-user";
type Repositories = ReturnType<typeof createRepositories>;

/** Keyset paging reads all memory, independently of the 50-lesson resume list. */
export async function readLearningMemory(repositories: Repositories) {
  const { profile, saved } = await readLearningProfile(repositories, LOCAL_LEARNER_ID);
  const contributions: LessonMemoryContribution[] = [];
  for (const type of ["learning_memory_contribution", "free_conversation_memory"] as const) {
    let cursor = "";
    for (;;) {
      const rows = await repositories.learningEvents.listMemoryContributions(
        LOCAL_LEARNER_ID,
        cursor,
        100,
        type,
      );
      for (const row of rows) {
        const contribution = lessonMemoryContributionSchema.parse(JSON.parse(row.payload));
        const free = type === "free_conversation_memory";
        if (
          row.userId !== LOCAL_LEARNER_ID ||
          row.type !== type ||
          row.id !== `memory-${contribution.lessonId}` ||
          row.id <= cursor ||
          (contribution.source === "free-conversation") !== free
        )
          throw new Error("Learning memory source identity is inconsistent");
        contributions.push(contribution);
        cursor = row.id;
      }
      if (rows.length < 100) break;
    }
  }
  let cursor = "";
  for (;;) {
    const rows = await repositories.learningEvents.listLegacyMemorySources(
      LOCAL_LEARNER_ID,
      cursor,
    );
    for (const row of rows) {
      const session = trainingSessionSchema.parse(JSON.parse(row.payload));
      if (
        row.userId !== LOCAL_LEARNER_ID ||
        row.type !== "training_checkpoint" ||
        row.id !== `training-${session.id}` ||
        row.id <= cursor
      )
        throw new Error("Legacy learning memory source identity is inconsistent");
      contributions.push(session.learningMemory ?? buildLearningContribution(session));
      cursor = row.id;
    }
    if (rows.length < 100) break;
  }
  return { contributions, document: projectLearningMemory(profile, contributions, saved) };
}

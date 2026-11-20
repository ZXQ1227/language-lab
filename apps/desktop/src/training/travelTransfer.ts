import { configureScenarioContent, type ScenarioContent } from "@language-lab/core";
import type { createRepositories } from "@language-lab/database";
import { trainingSessionSchema, type TrainingSession } from "./session";

export interface TravelTransferTask {
  source: TrainingSession;
  course: ScenarioContent;
  dueAt: number;
  deadline: number;
  attempt?: TrainingSession;
}

export function nextDayWindow(completedAt: number): { dueAt: number; deadline: number } {
  const date = new Date(completedAt);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  const dueAt = date.getTime();
  date.setDate(date.getDate() + 1);
  return { dueAt, deadline: date.getTime() };
}

export function buildTravelTransferTasks(
  sessions: readonly TrainingSession[],
): TravelTransferTask[] {
  const attempts = new Map(
    sessions.flatMap((session) =>
      session.travelTransfer ? [[session.travelTransfer.sourceLessonId, session] as const] : [],
    ),
  );
  return sessions
    .flatMap((source) => {
      if (
        source.scenario.slug !== "hotel-checkin" ||
        source.travelTransfer ||
        source.provider.mode !== "ai" ||
        source.state.phase !== "done" ||
        !source.learningReport
      )
        return [];
      const template = source.scenario.courseTemplate;
      const variation = template?.learningPack?.variations.find(
        (entry) => entry.id !== template.selectedVariationId,
      );
      if (!variation) return [];
      const attempt = attempts.get(source.id);
      return [
        {
          source,
          course: configureScenarioContent(source.scenario, { variationId: variation.id }),
          ...nextDayWindow(source.learningReport.generatedAt),
          ...(attempt?.scenario.courseTemplate?.selectedVariationId === variation.id
            ? { attempt }
            : {}),
        },
      ];
    })
    .sort((a, b) => b.dueAt - a.dueAt);
}

export function nextDayTransferResult(tasks: readonly TravelTransferTask[], now: number) {
  const elapsed = tasks.filter((task) => task.deadline <= now);
  const completedOnTime = elapsed.filter(({ attempt, dueAt, deadline }) => {
    const completedAt = attempt?.travelTransfer?.completedAt;
    return completedAt !== undefined && completedAt >= dueAt && completedAt < deadline;
  }).length;
  return { completedOnTime, eligible: elapsed.length };
}

export async function readTravelTransferTasks(repos: ReturnType<typeof createRepositories>) {
  const sessions: TrainingSession[] = [];
  let afterId = "";
  for (;;) {
    const rows = await repos.learningEvents.listHotelTrainingCheckpoints(afterId);
    for (const row of rows) {
      const session = trainingSessionSchema.parse(JSON.parse(row.payload));
      if (row.id !== `training-${session.id}` || row.id <= afterId)
        throw new Error("Travel practice source identity is inconsistent");
      sessions.push(session);
      afterId = row.id;
    }
    if (rows.length < 100) break;
  }
  return buildTravelTransferTasks(sessions);
}

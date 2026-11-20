import type { LessonMemoryContribution } from "@language-lab/memory";

export function relatedSpeakingPractice(
  contributions: readonly LessonMemoryContribution[],
  lesson: { id: string; language: string; category: string; offline: boolean },
) {
  return contributions
    .filter(
      (source) =>
        source.lessonId !== lesson.id &&
        source.completed &&
        source.language.toLowerCase() === lesson.language.toLowerCase() &&
        source.speakingPractice?.category === lesson.category,
    )
    .flatMap((source) =>
      (source.speakingPractice?.expressions ?? [])
        .filter((entry) => entry.status === "ready" && (!lesson.offline || entry.authored))
        .map((entry) => ({
          id: source.lessonId,
          anchorSeq: entry.anchorSeq,
          at: entry.answeredAt,
        })),
    )
    .sort((a, b) => b.at - a.at)[0];
}

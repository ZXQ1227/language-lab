import {
  summarizeVocabulary,
  learnerPracticeText,
  type EvidenceMessage,
  type ErrorDiagnosisRecord,
  type LessonState,
  type ScenarioContent,
} from "@language-lab/core";
import {
  errorMemoryKey,
  lessonMemoryContributionSchema,
  type LessonMemoryContribution,
} from "@language-lab/memory";

export interface LearningMemorySource {
  id: string;
  scenario: ScenarioContent;
  state: LessonState;
  provider: { mode: "demo" | "ai" };
  messages: EvidenceMessage[];
  diagnoses?: ErrorDiagnosisRecord[];
}

/** Project actual practice, never roleplay identities or assistant words. */
export function buildLearningContribution(session: LearningMemorySource): LessonMemoryContribution {
  const progress = summarizeVocabulary(
    session.state.targetVocabulary,
    session.messages,
    session.state.courseTemplate?.learningPack?.vocabulary.map((item) => ({
      term: item.term,
      forms: item.forms ?? [],
    })),
  );
  const errors = new Map<string, LessonMemoryContribution["errors"][number]>();
  for (const record of session.diagnoses ?? []) {
    const counted = new Set<string>();
    for (const error of record.diagnosis.errors) {
      const key = errorMemoryKey(error);
      if (counted.has(key)) continue;
      counted.add(key);
      const previous = errors.get(key);
      errors.set(key, {
        category: error.category,
        original: error.original,
        corrected: error.corrected,
        explanation: error.explanation,
        count: (previous?.count ?? 0) + 1,
        guidedCount: (previous?.guidedCount ?? 0) + (record.diagnosis.source === "demo" ? 1 : 0),
        modelCount: (previous?.modelCount ?? 0) + (record.diagnosis.source === "model" ? 1 : 0),
        latest: { messageSeq: record.messageSeq, quote: error.original },
      });
    }
  }
  return lessonMemoryContributionSchema.parse({
    version: 1,
    lessonId: session.id,
    title: session.scenario.title,
    language: session.state.courseTemplate?.targetLanguage ?? "en",
    difficulty: session.state.difficulty,
    mode: session.provider.mode,
    updatedAt: session.state.updatedAt,
    totalTurns: session.state.turnCount,
    practiceTurns: session.messages.filter(learnerPracticeText).length,
    completed: session.state.phase === "done",
    objectivesCompleted: session.state.objectives.filter((objective) => objective.completed).length,
    objectiveCount: session.state.objectives.length,
    knowledge: progress.map((item) => ({
      term: item.term,
      usedTurns: item.usedTurns,
      occurrences: item.occurrences,
      ...(item.latest
        ? { latest: { messageSeq: item.latest.messageSeq, quote: item.latest.quote } }
        : {}),
    })),
    errors: [...errors.values()],
  });
}

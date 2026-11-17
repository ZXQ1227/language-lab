import { z } from "zod";
import type { LessonState } from "./index";
import { validateStageAssessment, type EvidenceMessage } from "./assessment";
import {
  diagnosedErrorSchema,
  validateDiagnosisRecords,
  type ErrorDiagnosisRecord,
} from "./diagnosis";
import { summarizeVocabulary, vocabularyMatchSchema } from "./vocabulary";

const count = z.number().int().nonnegative();
const citation = z.object({ messageSeq: count, quote: z.string().min(1) });
export const learningReportSchema = z.object({
  version: z.literal(1),
  lessonId: z.string().min(1),
  generatedAt: count,
  provenance: z.enum(["saved_on_finish", "reconstructed"]),
  practiceTurns: count,
  supportTurns: count,
  hintsGiven: count,
  correctionsGiven: count,
  diagnosedTurns: count,
  uncertainTurns: count,
  withheldSuggestions: count,
  stages: z.array(
    z.object({
      id: z.string(),
      objectives: z.array(z.string()),
      criteria: z.array(
        z.object({ description: z.string(), met: z.boolean(), evidence: z.array(citation) }),
      ),
    }),
  ),
  vocabulary: z.array(
    z.object({
      term: z.string(),
      usedTurns: count,
      occurrences: count,
      latest: vocabularyMatchSchema.extend({ messageSeq: count, content: z.string() }).optional(),
    }),
  ),
  issues: z.array(
    z.object({
      messageSeq: count,
      error: diagnosedErrorSchema,
      source: z.enum(["model", "demo"]),
      shown: z.boolean(),
      deliveryVerified: z.boolean(),
    }),
  ),
  nextPractice: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["repair", "vocabulary", "course", "transfer"]),
        prompt: z.string(),
        suggestedAnswer: z.string().optional(),
        source: citation.optional(),
      }),
    )
    .max(5),
});
export type LearningReport = z.infer<typeof learningReportSchema>;

/** A replay of saved evidence, never a model grade or a proficiency estimate. */
export function buildLearningReport(
  source: {
    state: LessonState;
    messages: readonly EvidenceMessage[];
    diagnoses?: readonly ErrorDiagnosisRecord[];
  },
  metadata?: Pick<LearningReport, "generatedAt" | "provenance">,
): LearningReport {
  const { state, messages } = source;
  const course = state.courseTemplate;
  if (state.phase !== "done" || !course) throw new Error("Complete the lesson before reviewing it");
  const diagnoses = source.diagnoses ?? [];
  validateDiagnosisRecords(diagnoses, messages);
  const practice = messages.filter((m) => m.role === "user" && m.purpose !== "support");
  const stages = course.stages.map((stage) => {
    const raw = state.stageAssessments?.[stage.id];
    const assessment = raw ? validateStageAssessment(raw, stage, messages) : undefined;
    return {
      id: stage.id,
      objectives: state.objectives
        .filter((o) => stage.objectiveIds.includes(o.id))
        .map((o) => o.description),
      criteria: stage.successCriteria.map((description, criterionIndex) => {
        const criterion = assessment?.criteria.find((c) => c.criterionIndex === criterionIndex);
        return { description, met: criterion?.met ?? false, evidence: criterion?.evidence ?? [] };
      }),
    };
  });
  const vocabulary = summarizeVocabulary(
    state.targetVocabulary,
    messages,
    course.learningPack?.vocabulary.map((v) => ({ term: v.term, forms: v.forms ?? [] })),
  );
  const issues = diagnoses.flatMap((record) =>
    record.diagnosis.errors.map((error, index) => ({
      messageSeq: record.messageSeq,
      error,
      source: record.diagnosis.source,
      shown: record.correctionIndex === index,
      deliveryVerified:
        record.correctionIndex === index && record.interventionReason === "correct_error",
    })),
  );
  const nextPractice: LearningReport["nextPractice"] = [];
  const patterns = new Set<string>();
  for (const issue of issues) {
    const key = JSON.stringify([issue.error.category, issue.error.original, issue.error.corrected]);
    if (patterns.has(key)) continue;
    patterns.add(key);
    nextPractice.push({
      id: `repair-${nextPractice.length + 1}`,
      kind: "repair",
      prompt: `Try another sentence using “${issue.error.corrected}”. Check the suggestion against the original context.`,
      suggestedAnswer: issue.error.corrected,
      source: { messageSeq: issue.messageSeq, quote: issue.error.original },
    });
    if (nextPractice.length === 2) break;
  }
  for (const item of vocabulary.filter((v) => !v.usedTurns).slice(0, 2)) {
    nextPractice.push({
      id: `vocabulary-${nextPractice.length + 1}`,
      kind: "vocabulary",
      prompt: `Use “${item.term}” in a new reply for this scenario.`,
      suggestedAnswer: course.learningPack?.vocabulary.find((v) => v.term === item.term)?.example,
    });
  }
  const exercise = course.learningPack?.reviewPractice[0];
  nextPractice.push(
    exercise
      ? {
          id: `course-${exercise.id}`,
          kind: "course",
          prompt: exercise.prompt,
          suggestedAnswer: exercise.suggestedAnswer,
        }
      : {
          id: "transfer",
          kind: "transfer",
          prompt:
            "Repeat this scenario with different details. Try answering without hints, then compare with the goal evidence in this report.",
        },
  );
  return learningReportSchema.parse({
    version: 1,
    lessonId: state.lessonId,
    generatedAt: metadata?.generatedAt ?? state.updatedAt,
    provenance: metadata?.provenance ?? "reconstructed",
    practiceTurns: practice.length,
    supportTurns: messages.filter((m) => m.role === "user" && m.purpose === "support").length,
    hintsGiven: state.hintsGiven,
    correctionsGiven: state.correctionsGiven,
    diagnosedTurns: diagnoses.length,
    uncertainTurns: diagnoses.filter((d) => d.diagnosis.status === "uncertain").length,
    withheldSuggestions: diagnoses.reduce((sum, d) => sum + d.diagnosis.withheldCount, 0),
    stages,
    vocabulary,
    issues,
    nextPractice,
  });
}

import { z } from "zod";
import type { LessonState } from "./index";
import type { EvidenceMessage } from "./assessment";
import { diagnosedErrorSchema, type ErrorDiagnosisRecord } from "./diagnosis";
import { buildLearningReport } from "./learning-report";
import { normalizeVocabularyForm, trackVocabulary } from "./vocabulary";

const timestamp = z.number().int().nonnegative();
const day = 86_400_000;
const text = z.string().trim().min(1);
const common = { id: text, prompt: text.max(2000), dueInDays: z.number().int().min(1).max(3) };
export const reviewTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("error_practice"),
    error: diagnosedErrorSchema,
    evidence: z.object({
      messageSeq: timestamp,
      quote: z.string().min(1),
      context: z.string().min(1),
    }),
    diagnosisSource: z.enum(["model", "demo"]),
    diagnosisStatus: z.enum(["checked", "uncertain"]),
    observedTurns: z.number().int().positive(),
    reference: text.max(2000),
  }),
  z.object({
    ...common,
    kind: z.literal("vocabulary_drill"),
    term: text.max(120),
    forms: z.array(text.max(120)).max(8),
    meaning: text.optional(),
    reference: text.max(2000).optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("course_practice"),
    exerciseId: text.optional(),
    reference: text.max(2000).optional(),
  }),
]);
export type ReviewTask = z.infer<typeof reviewTaskSchema>;
export const reviewAttemptSchema = z.object({
  number: z.number().int().positive(),
  at: timestamp,
  answer: text.max(2000),
  exampleRevealed: z.boolean(),
  rating: z.enum(["again", "practised"]),
  check: z.enum([
    "reference_match",
    "reference_differs",
    "target_observed",
    "target_missing",
    "self_check",
  ]),
});
export type ReviewAttempt = z.infer<typeof reviewAttemptSchema>;
const progressSchema = z.object({
  taskId: text,
  status: z.enum(["pending", "done"]),
  dueAt: timestamp,
  attemptCount: z.number().int().nonnegative(),
  attempts: z.array(reviewAttemptSchema).max(10),
});
export const reviewPlanSchema = z
  .object({
    version: z.literal(1),
    lessonId: text,
    language: text,
    difficulty: text,
    generatedAt: timestamp,
    tasks: z.array(reviewTaskSchema).min(1).max(7),
    progress: z.array(progressSchema).min(1).max(7),
  })
  .superRefine((plan, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: "custom",
        message: "Review progress must match its tasks and saved attempts",
      });
    if (
      new Set(plan.tasks.map((t) => t.id)).size !== plan.tasks.length ||
      new Set(plan.progress.map((p) => p.taskId)).size !== plan.tasks.length ||
      plan.progress.length !== plan.tasks.length
    )
      invalid();
    for (const progress of plan.progress) {
      const task = plan.tasks.find((t) => t.id === progress.taskId);
      if (!task) {
        invalid();
        continue;
      }
      if (progress.attempts.length !== Math.min(progress.attemptCount, 10)) invalid();
      for (const [index, attempt] of progress.attempts.entries()) {
        const previous = progress.attempts[index - 1];
        if (
          attempt.number !== progress.attemptCount - progress.attempts.length + index + 1 ||
          attempt.at < plan.generatedAt ||
          (previous && (attempt.at < previous.at || previous.rating === "practised")) ||
          attempt.check !== checkReviewAnswer(task, attempt.answer)
        )
          invalid();
      }
      const last = progress.attempts.at(-1);
      if (
        progress.status !== (last?.rating === "practised" ? "done" : "pending") ||
        progress.dueAt !== (last ? last.at + day : plan.generatedAt + task.dueInDays * day)
      )
        invalid();
    }
  });
export type ReviewPlan = z.infer<typeof reviewPlanSchema>;
export interface ReviewSource {
  state: LessonState;
  messages: readonly EvidenceMessage[];
  diagnoses?: readonly ErrorDiagnosisRecord[];
}

/** Reference/lexical feedback only; never a semantic grade or mastery decision. */
export function checkReviewAnswer(task: ReviewTask, answer: string): ReviewAttempt["check"] {
  if (task.kind === "error_practice") {
    const normalize = (value: string) =>
      normalizeVocabularyForm(value)
        .replace(/[.!?。！？]+$/u, "")
        .trim();
    return normalize(answer) === normalize(task.reference)
      ? "reference_match"
      : "reference_differs";
  }
  if (task.kind === "vocabulary_drill")
    return trackVocabulary(answer, [task.term], [{ term: task.term, forms: task.forms }]).used
      .length
      ? "target_observed"
      : "target_missing";
  return "self_check";
}

/** Stable per-lesson targets: frequent/meaning-affecting short issues, missed words, transfer. */
export function generateReviewPlan(
  source: ReviewSource,
  generatedAt = source.state.updatedAt,
): ReviewPlan {
  const report = buildLearningReport(source);
  const course = source.state.courseTemplate!;
  const tasks: ReviewTask[] = [];
  const candidates = new Map<
    string,
    { issue: (typeof report.issues)[number]; turns: Set<number> }
  >();
  for (const issue of report.issues) {
    if (issue.error.corrected.length > 160 || issue.error.original.length > 200) continue;
    const key = JSON.stringify([
      issue.error.category,
      normalizeVocabularyForm(issue.error.original),
      normalizeVocabularyForm(issue.error.corrected),
    ]);
    const candidate = candidates.get(key) ?? { issue, turns: new Set<number>() };
    candidate.turns.add(issue.messageSeq);
    candidates.set(key, candidate);
  }
  const ordered = [...candidates.values()].sort(
    (a, b) =>
      b.turns.size - a.turns.size ||
      Number(b.issue.error.severity === "meaning") - Number(a.issue.error.severity === "meaning") ||
      a.issue.messageSeq - b.issue.messageSeq,
  );
  for (const { issue, turns } of ordered.slice(0, 3)) {
    tasks.push({
      id: `${source.state.lessonId}:review:v1:error-${tasks.length + 1}`,
      kind: "error_practice",
      dueInDays: 1,
      prompt:
        "Replace only the quoted wording using the original context. Recall it before revealing the suggestion.",
      error: issue.error,
      evidence: {
        messageSeq: issue.messageSeq,
        quote: issue.error.original,
        context: source.messages.find((m) => m.seq === issue.messageSeq)!.content,
      },
      diagnosisSource: issue.source,
      diagnosisStatus: source.diagnoses!.find((record) => record.messageSeq === issue.messageSeq)!
        .diagnosis.status,
      observedTurns: turns.size,
      reference: issue.error.corrected,
    });
  }
  for (const [index, word] of report.vocabulary
    .filter((v) => !v.usedTurns && v.term.length <= 120)
    .slice(0, 3)
    .entries()) {
    const authored = course.learningPack?.vocabulary.find((v) => v.term === word.term);
    tasks.push({
      id: `${source.state.lessonId}:review:v1:vocabulary-${index + 1}`,
      kind: "vocabulary_drill",
      dueInDays: 2,
      prompt: `Write a new reply for this scenario using “${word.term}”.`,
      term: word.term,
      forms: authored?.forms ?? [],
      meaning: authored?.meaning,
      reference:
        authored?.example.length && authored.example.length <= 2000 ? authored.example : undefined,
    });
  }
  const exercise = course.learningPack?.reviewPractice.find(
    (e) => e.prompt.length <= 2000 && e.suggestedAnswer.length <= 2000,
  );
  tasks.push({
    id: `${source.state.lessonId}:review:v1:course`,
    kind: "course_practice",
    dueInDays: 3,
    prompt:
      exercise?.prompt ??
      "Write a fresh reply for this scenario using different details. Check it against the course goals and facts.",
    exerciseId: exercise?.id,
    reference: exercise?.suggestedAnswer,
  });
  return reviewPlanSchema.parse({
    version: 1,
    lessonId: source.state.lessonId,
    language: course.targetLanguage,
    difficulty: source.state.difficulty,
    generatedAt,
    tasks,
    progress: tasks.map((task) => ({
      taskId: task.id,
      status: "pending",
      dueAt: generatedAt + task.dueInDays * day,
      attemptCount: 0,
      attempts: [],
    })),
  });
}

/** Check immutable targets against the original lesson; personal attempts remain separate evidence. */
export function validateReviewPlan(raw: unknown, source: ReviewSource): ReviewPlan {
  const plan = reviewPlanSchema.parse(raw);
  const expected = generateReviewPlan(source, plan.generatedAt);
  const targets = (p: ReviewPlan) => ({
    version: p.version,
    lessonId: p.lessonId,
    language: p.language,
    difficulty: p.difficulty,
    tasks: p.tasks,
  });
  if (JSON.stringify(targets(plan)) !== JSON.stringify(targets(expected)))
    throw new Error("Review targets must match the source lesson evidence");
  return plan;
}

export function recordReviewAttempt(
  raw: ReviewPlan,
  taskId: string,
  input: { answer: string; exampleRevealed: boolean; rating: ReviewAttempt["rating"] },
  at = Date.now(),
): ReviewPlan {
  const plan = reviewPlanSchema.parse(raw);
  const task = plan.tasks.find((t) => t.id === taskId);
  const progress = plan.progress.find((p) => p.taskId === taskId);
  if (!task || !progress) throw new Error("Unknown review task");
  if (progress.status === "done") throw new Error("This review task has already been completed");
  const attempt = reviewAttemptSchema.parse({
    ...input,
    number: progress.attemptCount + 1,
    at,
    check: checkReviewAnswer(task, input.answer),
  });
  return reviewPlanSchema.parse({
    ...plan,
    progress: plan.progress.map((p) =>
      p.taskId !== taskId
        ? p
        : {
            ...p,
            status: input.rating === "practised" ? "done" : "pending",
            dueAt: at + day,
            attemptCount: p.attemptCount + 1,
            attempts: [...p.attempts, attempt].slice(-10),
          },
    ),
  });
}

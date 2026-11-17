import { z } from "zod";
import type { MemorySnapshot } from "./index";
import type { createRepositories } from "@language-lab/database";

const text = z.string().trim().min(1);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const profileMemorySchema = z.strictObject({
  targetLanguage: text.max(35).regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  goals: z.array(text.max(200)).max(10),
});
export const defaultProfileMemory = () =>
  profileMemorySchema.parse({ targetLanguage: "en", level: "A2", goals: [] });
const evidence = z.strictObject({
  messageSeq: z
    .number()
    .int()
    .positive()
    .refine((value) => value % 2 === 1),
  quote: z
    .string()
    .min(1)
    .max(4000)
    .refine((value) => !!value.trim()),
});
const category = z.enum(["grammar", "vocabulary", "collocation", "tense", "article", "spelling"]);
export const lessonMemoryContributionSchema = z
  .strictObject({
    version: z.literal(1),
    lessonId: text.max(200),
    language: text.max(100),
    title: text.max(300),
    difficulty: text.max(20),
    mode: z.enum(["demo", "ai"]),
    updatedAt: timestamp,
    totalTurns: z.number().int().min(0).max(100),
    practiceTurns: z.number().int().min(0).max(100),
    completed: z.boolean(),
    objectivesCompleted: z.number().int().nonnegative(),
    objectiveCount: z.number().int().nonnegative(),
    knowledge: z.array(
      z.strictObject({
        term: text,
        usedTurns: z.number().int().min(0).max(100),
        occurrences: z.number().int().nonnegative(),
        latest: evidence.optional(),
      }),
    ),
    errors: z
      .array(
        z.strictObject({
          category,
          original: z.string().min(1).max(4000),
          corrected: text.max(4000),
          explanation: text.max(600),
          count: z.number().int().min(1).max(100),
          guidedCount: z.number().int().nonnegative(),
          modelCount: z.number().int().nonnegative(),
          latest: evidence,
        }),
      )
      .max(500),
  })
  .superRefine((lesson, ctx) => {
    if (
      lesson.practiceTurns > lesson.totalTurns ||
      lesson.objectivesCompleted > lesson.objectiveCount ||
      (lesson.completed &&
        (lesson.objectiveCount === 0 || lesson.objectivesCompleted !== lesson.objectiveCount))
    )
      ctx.addIssue({ code: "custom", message: "Memory lesson counters are inconsistent" });
    const terms = new Set<string>();
    for (const item of lesson.knowledge) {
      const key = memoryTextKey(item.term);
      if (
        terms.has(key) ||
        item.usedTurns > lesson.practiceTurns ||
        item.occurrences < item.usedTurns ||
        (item.usedTurns === 0 && item.occurrences !== 0) ||
        item.usedTurns > 0 !== !!item.latest ||
        (!!item.latest && item.latest.messageSeq > lesson.totalTurns * 2)
      )
        ctx.addIssue({
          code: "custom",
          message: "Knowledge memory must have unique terms and consistent practice evidence",
        });
      terms.add(key);
    }
    const errors = new Set<string>();
    for (const item of lesson.errors) {
      const key = errorMemoryKey(item);
      if (
        errors.has(key) ||
        item.count > lesson.practiceTurns ||
        item.guidedCount + item.modelCount !== item.count ||
        item.latest.messageSeq > lesson.totalTurns * 2 ||
        item.latest.quote !== item.original
      )
        ctx.addIssue({
          code: "custom",
          message: "Error memory must have unique patterns and consistent practice evidence",
        });
      errors.add(key);
    }
  });
export type LessonMemoryContribution = z.infer<typeof lessonMemoryContributionSchema>;
export type LearningProfile = z.infer<typeof profileMemorySchema>;
export const memoryTextKey = (text: string) =>
  text
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/ς/gu, "σ")
    .replace(/[’ʼ]/gu, "'")
    .replace(/\s+/gu, " ");
export const errorMemoryKey = (error: { category: string; original: string; corrected: string }) =>
  JSON.stringify([error.category, memoryTextKey(error.original), memoryTextKey(error.corrected)]);
type MemoryEvidence = z.infer<typeof evidence> & { lessonId: string; title: string };
export interface KnowledgeObservation {
  item: string;
  language: string;
  mastery: "new" | "learning";
  practiceTurns: number;
  occurrences: number;
  guidedTurns: number;
  freeTurns: number;
  lessonCount: number;
  lastSeen: string;
  latest?: MemoryEvidence;
}
export interface ErrorObservation {
  pattern: string;
  language: string;
  category: z.infer<typeof category>;
  original: string;
  corrected: string;
  explanation: string;
  count: number;
  guidedCount: number;
  modelCount: number;
  lessonCount: number;
  lastSeen: string;
  latest: MemoryEvidence;
}
export interface EpisodeObservation {
  lessonId: string;
  language: string;
  title: string;
  difficulty: string;
  mode: "demo" | "ai";
  completed: boolean;
  summary: string;
  at: string;
}
export interface LearningMemoryDocument {
  profile: LearningProfile;
  profileSaved: boolean;
  knowledge: KnowledgeObservation[];
  errors: ErrorObservation[];
  episodes: EpisodeObservation[];
}

/** Replace a lesson's contribution; never increment a global total on retry. */
export function projectLearningMemory(
  profile: LearningProfile,
  sources: readonly LessonMemoryContribution[],
  profileSaved = false,
): LearningMemoryDocument {
  const lessons = new Map<string, LessonMemoryContribution>();
  for (const raw of sources) {
    const lesson = lessonMemoryContributionSchema.parse(raw);
    const previous = lessons.get(lesson.lessonId);
    if (
      !previous ||
      lesson.totalTurns > previous.totalTurns ||
      (lesson.totalTurns === previous.totalTurns &&
        (Number(lesson.completed) > Number(previous.completed) ||
          (lesson.completed === previous.completed && lesson.updatedAt >= previous.updatedAt)))
    )
      lessons.set(lesson.lessonId, lesson);
  }
  const knowledge = new Map<string, KnowledgeObservation>();
  const errors = new Map<string, ErrorObservation>();
  const episodes: EpisodeObservation[] = [];
  for (const lesson of [...lessons.values()].sort(
    (a, b) => a.updatedAt - b.updatedAt || a.lessonId.localeCompare(b.lessonId),
  )) {
    const language = lesson.language;
    const at = new Date(lesson.updatedAt).toISOString();
    for (const word of lesson.knowledge) {
      const key = JSON.stringify([memoryTextKey(language), memoryTextKey(word.term)]);
      const previous = knowledge.get(key);
      const practiceTurns = (previous?.practiceTurns ?? 0) + word.usedTurns;
      knowledge.set(key, {
        item: word.term,
        language,
        mastery: practiceTurns > 0 ? "learning" : "new",
        practiceTurns,
        occurrences: (previous?.occurrences ?? 0) + word.occurrences,
        guidedTurns: (previous?.guidedTurns ?? 0) + (lesson.mode === "demo" ? word.usedTurns : 0),
        freeTurns: (previous?.freeTurns ?? 0) + (lesson.mode === "ai" ? word.usedTurns : 0),
        lessonCount: (previous?.lessonCount ?? 0) + 1,
        lastSeen: word.latest ? at : (previous?.lastSeen ?? at),
        latest: word.latest
          ? { ...word.latest, lessonId: lesson.lessonId, title: lesson.title }
          : previous?.latest,
      });
    }
    for (const error of lesson.errors) {
      const key = JSON.stringify([memoryTextKey(language), errorMemoryKey(error)]);
      const previous = errors.get(key);
      errors.set(key, {
        pattern: `${error.original} → ${error.corrected}`,
        language,
        category: error.category,
        original: error.original,
        corrected: error.corrected,
        explanation: error.explanation,
        count: (previous?.count ?? 0) + error.count,
        guidedCount: (previous?.guidedCount ?? 0) + error.guidedCount,
        modelCount: (previous?.modelCount ?? 0) + error.modelCount,
        lessonCount: (previous?.lessonCount ?? 0) + 1,
        lastSeen: at,
        latest: { ...error.latest, lessonId: lesson.lessonId, title: lesson.title },
      });
    }
    episodes.push({
      lessonId: lesson.lessonId,
      language,
      title: lesson.title,
      difficulty: lesson.difficulty,
      mode: lesson.mode,
      completed: lesson.completed,
      at,
      summary: `${lesson.completed ? "Completed" : "Practised"} ${lesson.title}: ${lesson.practiceTurns} practice ${lesson.practiceTurns === 1 ? "reply" : "replies"}, ${lesson.objectivesCompleted}/${lesson.objectiveCount} objectives; ${lesson.mode === "demo" ? "guided examples, not independent assessment" : "connected AI practice"}.`,
    });
  }
  return {
    profile: profileMemorySchema.parse(profile),
    profileSaved,
    knowledge: [...knowledge.values()].sort(
      (a, b) =>
        Number(b.practiceTurns > 0) - Number(a.practiceTurns > 0) ||
        b.lastSeen.localeCompare(a.lastSeen) ||
        a.item.localeCompare(b.item),
    ),
    errors: [...errors.values()].sort(
      (a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen),
    ),
    episodes: episodes.reverse(),
  };
}

/** A bounded language-scoped view; course level/facts remain authoritative. */
export function selectLearningMemory(
  document: LearningMemoryDocument,
  language: string,
  targets: readonly string[],
): MemorySnapshot {
  const sameLanguage = (item: { language: string }) =>
    memoryTextKey(item.language) === memoryTextKey(language);
  const terms = new Set(targets.map(memoryTextKey));
  return {
    profile: {
      ...document.profile,
      source: document.profileSaved ? "self_reported" : "default",
      goals:
        memoryTextKey(document.profile.targetLanguage) === memoryTextKey(language)
          ? document.profile.goals
          : [],
    },
    knowledge: document.knowledge
      .filter((item) => sameLanguage(item) && terms.has(memoryTextKey(item.item)))
      .sort((a, b) => b.practiceTurns - a.practiceTurns || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, 20),
    errors: document.errors.filter(sameLanguage).slice(0, 10),
    episodes: document.episodes.filter(sameLanguage).slice(0, 5),
  };
}

type Repositories = ReturnType<typeof createRepositories>;
export async function readLearningProfile(
  repositories: Repositories,
  userId: string,
): Promise<{ profile: LearningProfile; saved: boolean }> {
  const row = await repositories.profiles.findByUserId(userId);
  return row
    ? {
        profile: profileMemorySchema.parse({
          targetLanguage: row.targetLanguage,
          level: row.level,
          goals: JSON.parse(row.goals),
        }),
        saved: true,
      }
    : { profile: defaultProfileMemory(), saved: false };
}
export async function writeLearningProfile(
  repositories: Repositories,
  userId: string,
  raw: unknown,
): Promise<LearningProfile> {
  const profile = profileMemorySchema.parse(raw);
  await repositories.profiles.save({ userId, ...profile });
  return profile;
}

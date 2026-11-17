import { z } from "zod";
import { normalizeVocabularyForm } from "./vocabulary";

const text = z.string().trim().min(1);
const id = text.regex(/^[a-z0-9-]+$/);
export const courseFactSchema = z.strictObject({ label: text, value: text });
const exerciseSchema = z.strictObject({ id, prompt: text, suggestedAnswer: text });
const guidedPracticeSchema = z.strictObject({
  stageId: id,
  suggestedReply: text,
  partnerPrompt: text,
});

/** Optional authored study material around a course's existing teaching stages. */
export const learningPackSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    overview: text,
    prerequisites: z.array(text),
    scenarioFacts: z.array(courseFactSchema).min(1),
    vocabulary: z
      .array(
        z.strictObject({
          term: text,
          meaning: text,
          translation: text.optional(),
          example: text,
          forms: z.array(text.max(120)).max(8).optional(),
        }),
      )
      .min(1),
    warmup: z.array(exerciseSchema).min(1),
    modelDialogue: z
      .array(z.strictObject({ stageId: id, role: z.enum(["learner", "partner"]), text }))
      .min(2),
    guidedPractice: z.array(guidedPracticeSchema).min(1),
    reviewPractice: z.array(exerciseSchema).min(1),
    variations: z.array(
      z.strictObject({
        id: id.refine((value) => value !== "standard", "standard is reserved for the base course"),
        title: text,
        briefing: text,
        settingAddition: text,
        openingLine: text.optional(),
        factOverrides: z.array(courseFactSchema),
        stageOverrides: z
          .array(
            z.strictObject({
              stageId: id,
              instruction: text,
              successCriteria: z.array(text).min(1),
              hints: z.array(text),
              suggestedReply: text,
              partnerPrompt: text,
            }),
          )
          .min(1),
      }),
    ),
  })
  .superRefine((pack, ctx) => {
    const unique = (values: string[], path: (string | number)[]) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value))
          ctx.addIssue({
            code: "custom",
            path: [...path, index],
            message: `Duplicate reference: ${value}`,
          });
        seen.add(value);
      });
    };
    unique(
      pack.scenarioFacts.map((item) => item.label),
      ["scenarioFacts"],
    );
    unique(
      pack.vocabulary.map((item) => item.term.toLowerCase()),
      ["vocabulary"],
    );
    const owners = new Map<string, number>();
    pack.vocabulary.forEach((item, index) => {
      for (const form of [item.term, ...(item.forms ?? [])]) {
        const key = normalizeVocabularyForm(form);
        const owner = owners.get(key);
        if (!key || (owner !== undefined && owner !== index))
          ctx.addIssue({
            code: "custom",
            path: ["vocabulary", index, "forms"],
            message: "Vocabulary forms must be nonempty and unambiguous between terms",
          });
        owners.set(key, index);
      }
    });
    unique(
      pack.warmup.map((item) => item.id),
      ["warmup"],
    );
    unique(
      pack.reviewPractice.map((item) => item.id),
      ["reviewPractice"],
    );
    unique(
      pack.guidedPractice.map((item) => item.stageId),
      ["guidedPractice"],
    );
    unique(
      pack.variations.map((item) => item.id),
      ["variations"],
    );
    pack.variations.forEach((variation, index) => {
      unique(
        variation.stageOverrides.map((item) => item.stageId),
        ["variations", index, "stageOverrides"],
      );
      unique(
        variation.factOverrides.map((item) => item.label),
        ["variations", index, "factOverrides"],
      );
      variation.factOverrides.forEach((fact, factIndex) => {
        if (!pack.scenarioFacts.some((item) => item.label === fact.label))
          ctx.addIssue({
            code: "custom",
            path: ["variations", index, "factOverrides", factIndex],
            message: `Unknown hotel fact: ${fact.label}`,
          });
      });
    });
  });

export type LearningPack = z.infer<typeof learningPackSchema>;

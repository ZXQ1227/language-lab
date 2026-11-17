import { z } from "zod";
import { learningPackSchema } from "./course-pack";

const text = z.string().trim().min(1);
export const cefrLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const teachingPolicySchema = z.strictObject({
  correctionMode: z.enum(["gentle", "off"]),
  maxCorrections: z.number().int().min(0).max(20),
  maxHints: z.number().int().min(0).max(20),
});

export const courseStageSchema = z.strictObject({
  id: text.regex(/^[a-z0-9-]+$/),
  title: text,
  instruction: text,
  // Existing lesson objectives have deterministic ids: obj-1, obj-2, ...
  objectiveIds: z.array(text.regex(/^obj-[1-9]\d*$/)).min(1),
  successCriteria: z.array(text).min(1),
  hints: z.array(text),
});

/** Authored teaching material, never learner progress or model output. */
export const courseTemplateSchema = z
  .strictObject({
    targetLanguage: text,
    estimatedMinutes: z.number().int().min(1).max(120),
    setting: text,
    roles: z.strictObject({ learner: text, partner: text }),
    openingLine: text,
    targetPatterns: z.array(z.strictObject({ pattern: text, example: text })).min(1),
    stages: z.array(courseStageSchema).min(1).max(12),
    teachingPolicy: teachingPolicySchema,
    learningPack: learningPackSchema.optional(),
    selectedVariationId: text.optional(),
  })
  .superRefine((course, ctx) => {
    const ids = new Set<string>();
    const assigned = new Set<string>();
    course.stages.forEach((stage, index) => {
      if (ids.has(stage.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", index, "id"],
          message: "Duplicate stage id",
        });
      }
      ids.add(stage.id);
      stage.objectiveIds.forEach((id, objectiveIndex) => {
        if (assigned.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["stages", index, "objectiveIds", objectiveIndex],
            message: "Each objective must belong to exactly one stage",
          });
        }
        assigned.add(id);
      });
    });
    const pack = course.learningPack;
    if (
      course.selectedVariationId &&
      !pack?.variations.some((item) => item.id === course.selectedVariationId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["selectedVariationId"],
        message: "Unknown course variation",
      });
    if (pack) {
      const reference = (stageId: string, path: (string | number)[]) => {
        if (!ids.has(stageId))
          ctx.addIssue({ code: "custom", path, message: `Unknown stage: ${stageId}` });
      };
      pack.guidedPractice.forEach((item, index) =>
        reference(item.stageId, ["learningPack", "guidedPractice", index, "stageId"]),
      );
      pack.modelDialogue.forEach((item, index) =>
        reference(item.stageId, ["learningPack", "modelDialogue", index, "stageId"]),
      );
      pack.variations.forEach((variation, index) =>
        variation.stageOverrides.forEach((item, stageIndex) =>
          reference(item.stageId, [
            "learningPack",
            "variations",
            index,
            "stageOverrides",
            stageIndex,
            "stageId",
          ]),
        ),
      );
      for (const stageId of ids) {
        if (!pack.guidedPractice.some((item) => item.stageId === stageId))
          ctx.addIssue({
            code: "custom",
            path: ["learningPack", "guidedPractice"],
            message: `Missing guided practice for ${stageId}`,
          });
        for (const role of ["learner", "partner"]) {
          if (!pack.modelDialogue.some((item) => item.stageId === stageId && item.role === role))
            ctx.addIssue({
              code: "custom",
              path: ["learningPack", "modelDialogue"],
              message: `Missing ${role} model line for ${stageId}`,
            });
        }
      }
    }
  });

export type CourseTemplate = z.infer<typeof courseTemplateSchema>;
export type CourseStage = z.infer<typeof courseStageSchema>;
export type TeachingPolicy = z.infer<typeof teachingPolicySchema>;

/** Old seven-field scenarios remain readable; new teaching content is explicit. */
export const scenarioContentSchema = z
  .strictObject({
    schemaVersion: z.literal(1).default(1),
    id: text,
    slug: text.regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
    title: text,
    category: text,
    difficulty: cefrLevelSchema,
    objectives: z.array(text).min(1),
    targetVocabulary: z.array(text).min(1),
    courseTemplate: courseTemplateSchema.optional(),
  })
  .superRefine((scenario, ctx) => {
    if (!scenario.courseTemplate) return;
    const expected = scenario.objectives.map((_, index) => `obj-${index + 1}`);
    const assigned = new Set(scenario.courseTemplate.stages.flatMap((stage) => stage.objectiveIds));
    scenario.courseTemplate.stages.forEach((stage, index) => {
      stage.objectiveIds.forEach((id, objectiveIndex) => {
        if (!expected.includes(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["courseTemplate", "stages", index, "objectiveIds", objectiveIndex],
            message: `Unknown objective: ${id}`,
          });
        }
      });
    });
    for (const id of expected) {
      if (!assigned.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["courseTemplate", "stages"],
          message: `Objective ${id} needs a teaching stage`,
        });
      }
    }
    const vocabulary = scenario.courseTemplate.learningPack?.vocabulary;
    if (
      vocabulary &&
      (vocabulary.length !== scenario.targetVocabulary.length ||
        vocabulary.some(
          (item) =>
            !scenario.targetVocabulary.some(
              (term) => term.toLowerCase() === item.term.toLowerCase(),
            ),
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["courseTemplate", "learningPack", "vocabulary"],
        message: "Learning pack vocabulary must cover the target vocabulary exactly",
      });
    }
  });

export type ScenarioContent = z.infer<typeof scenarioContentSchema>;

export const courseConfigurationSchema = z.strictObject({
  difficulty: cefrLevelSchema.optional(),
  teachingPolicy: teachingPolicySchema.partial().optional(),
  variationId: text.optional(),
});

export type CourseConfiguration = z.infer<typeof courseConfigurationSchema>;

/** Validate, copy and configure a template without changing shipped content. */
export function configureScenarioContent(
  raw: unknown,
  configuration: CourseConfiguration = {},
): ScenarioContent {
  const scenario = scenarioContentSchema.parse(raw);
  const options = courseConfigurationSchema.parse(configuration);
  if (options.teachingPolicy && !scenario.courseTemplate) {
    throw new Error("This legacy scenario has no configurable course template");
  }
  if (options.variationId && !scenario.courseTemplate?.learningPack)
    throw new Error("This course has no authored variations");
  return scenarioContentSchema.parse({
    ...scenario,
    difficulty: options.difficulty ?? scenario.difficulty,
    ...(scenario.courseTemplate
      ? {
          courseTemplate: {
            ...scenario.courseTemplate,
            ...(options.variationId !== undefined
              ? {
                  selectedVariationId:
                    options.variationId === "standard" ? undefined : options.variationId,
                }
              : {}),
            teachingPolicy: {
              ...scenario.courseTemplate.teachingPolicy,
              ...options.teachingPolicy,
            },
          },
        }
      : {}),
  });
}

/** Compile the chosen challenge from the original material; never patch a snapshot twice. */
export function resolveCourseTemplate(scenario: ScenarioContent): CourseTemplate | undefined {
  if (!scenario.courseTemplate) return undefined;
  const template = courseTemplateSchema.parse(scenario.courseTemplate);
  const variation = template.learningPack?.variations.find(
    (item) => item.id === template.selectedVariationId,
  );
  if (!variation || !template.learningPack) return template;
  template.setting += `\nChallenge: ${variation.settingAddition}`;
  template.openingLine = variation.openingLine ?? template.openingLine;
  template.stages = template.stages.map((stage) => {
    const override = variation.stageOverrides.find((item) => item.stageId === stage.id);
    return override
      ? {
          ...stage,
          instruction: override.instruction,
          successCriteria: override.successCriteria,
          hints: override.hints,
        }
      : stage;
  });
  template.learningPack.scenarioFacts = template.learningPack.scenarioFacts.map(
    (fact) => variation.factOverrides.find((item) => item.label === fact.label) ?? fact,
  );
  template.learningPack.guidedPractice = template.learningPack.guidedPractice.map((practice) => {
    const override = variation.stageOverrides.find((item) => item.stageId === practice.stageId);
    return override
      ? {
          stageId: practice.stageId,
          suggestedReply: override.suggestedReply,
          partnerPrompt: override.partnerPrompt,
        }
      : practice;
  });
  return courseTemplateSchema.parse(template);
}

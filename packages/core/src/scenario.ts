import { z } from "zod";

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
  });

export type ScenarioContent = z.infer<typeof scenarioContentSchema>;

export const courseConfigurationSchema = z.strictObject({
  difficulty: cefrLevelSchema.optional(),
  teachingPolicy: teachingPolicySchema.partial().optional(),
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
  return scenarioContentSchema.parse({
    ...scenario,
    difficulty: options.difficulty ?? scenario.difficulty,
    ...(scenario.courseTemplate
      ? {
          courseTemplate: {
            ...scenario.courseTemplate,
            teachingPolicy: {
              ...scenario.courseTemplate.teachingPolicy,
              ...options.teachingPolicy,
            },
          },
        }
      : {}),
  });
}

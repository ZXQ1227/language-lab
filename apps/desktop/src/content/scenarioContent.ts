// Scenario content loader.
//
// Static bundled files are validated and ordered by the starter catalog.

/// <reference types="vite/client" />
import { z } from "zod";
import { scenarioContentSchema, type ScenarioContent } from "@language-lab/core";
import manifest from "../../../../content/starter-catalog.json";

export function parseScenarioContent(raw: unknown): ScenarioContent {
  return scenarioContentSchema.parse(raw);
}

const catalogSchema = z
  .array(
    z.strictObject({
      id: z.enum(["travel", "career", "campus", "overseas-life", "social"]),
      courses: z
        .array(
          z.strictObject({
            slug: z.string().min(1),
            topic: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
          }),
        )
        .min(1),
    }),
  )
  .length(5);
const files = import.meta.glob<unknown>("../../../../content/scenarios/*.json", {
  eager: true,
  import: "default",
});
const assigned = new Set<string>();
const catalog = catalogSchema.parse(manifest);
if (new Set(catalog.map(({ id }) => id)).size !== catalog.length)
  throw new Error("Starter course path IDs must be distinct");
const topicPaths = new Map<string, string>();
export const starterCoursePaths = catalog.map(({ id, courses }) => {
  const entries = courses.map(({ slug, topic }) => {
    const raw = files[`../../../../content/scenarios/${slug}.json`];
    if (!raw || assigned.has(slug)) throw new Error(`Invalid starter catalog entry: ${slug}`);
    const course = parseScenarioContent(raw);
    if (course.slug !== slug || !course.courseTemplate)
      throw new Error(`Starter course ${slug} must match its filename and include a template`);
    assigned.add(slug);
    if (topicPaths.has(topic) && topicPaths.get(topic) !== id)
      throw new Error(`Starter topic ${topic} belongs to multiple paths`);
    topicPaths.set(topic, id);
    return { course, topic };
  });
  return { id, entries };
});
if (assigned.size !== Object.keys(files).length)
  throw new Error("Every bundled scenario must be listed in the starter catalog");

export function loadScenarioContent(): ScenarioContent[] {
  return starterCoursePaths.flatMap(({ entries }) => entries.map(({ course }) => course));
}

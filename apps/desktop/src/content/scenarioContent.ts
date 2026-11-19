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
      courses: z.array(z.string().min(1)).min(1),
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
export const starterCoursePaths = catalog.map(({ id, courses }) => ({
  id,
  courses: courses.map((slug) => {
    const raw = files[`../../../../content/scenarios/${slug}.json`];
    if (!raw || assigned.has(slug)) throw new Error(`Invalid starter catalog entry: ${slug}`);
    const course = parseScenarioContent(raw);
    if (course.slug !== slug || !course.courseTemplate)
      throw new Error(`Starter course ${slug} must match its filename and include a template`);
    assigned.add(slug);
    return course;
  }),
}));
if (assigned.size !== Object.keys(files).length)
  throw new Error("Every bundled scenario must be listed in the starter catalog");

export function loadScenarioContent(): ScenarioContent[] {
  return starterCoursePaths.flatMap(({ courses }) => courses);
}

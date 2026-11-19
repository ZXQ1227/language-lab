// Product content validation: every file in content/scenarios must satisfy
// scenarioContentSchema, slugs/ids must be unique, and the bundled seed
// module must mirror the files on disk.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioContentSchema } from "@language-lab/core";
import {
  loadScenarioContent,
  starterCoursePaths,
} from "../../../apps/desktop/src/content/scenarioContent";

const SCENARIOS_DIR = join(__dirname, "../../../content/scenarios");

function listContentFiles(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

describe("content/scenarios", () => {
  const files = listContentFiles();

  it("orders the five starter paths and contains every topic plus the cafe supplement", () => {
    expect(
      starterCoursePaths.map(({ id, courses }) => [id, courses.length, courses[0]?.slug]),
    ).toEqual([
      ["travel", 9, "airport-check-in"],
      ["career", 9, "job-hunting"],
      ["campus", 6, "teacher-office-hours"],
      ["overseas-life", 10, "supermarket-service"],
      ["social", 7, "small-talk"],
    ]);
    expect(files).toHaveLength(41);
  });

  it("every scenario file satisfies scenarioContentSchema", () => {
    for (const file of files) {
      const raw: unknown = JSON.parse(readFileSync(join(SCENARIOS_DIR, file), "utf-8"));
      const parsed = scenarioContentSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `content/scenarios/${file} is invalid: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ")}`,
        );
      }
      expect(
        parsed.data.courseTemplate,
        `${file} must include authored teaching material`,
      ).toBeDefined();
    }
  });

  it("slugs and ids are unique and slugs match file names", () => {
    const parsed = files.map((file) =>
      scenarioContentSchema.parse(JSON.parse(readFileSync(join(SCENARIOS_DIR, file), "utf-8"))),
    );
    const slugs = parsed.map((s) => s.slug);
    const ids = parsed.map((s) => s.id);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of parsed) {
      expect(files).toContain(`${s.slug}.json`);
    }
  });

  it("the bundled seed mirrors the files on disk", () => {
    const bundled = loadScenarioContent();
    expect(bundled).toHaveLength(files.length);
    for (const scenario of bundled) {
      const onDisk = scenarioContentSchema.parse(
        JSON.parse(readFileSync(join(SCENARIOS_DIR, `${scenario.slug}.json`), "utf-8")),
      );
      expect(scenario).toEqual(onDisk);
    }
  });

  it("includes translated expressions and guided replies in each new starter lesson", () => {
    const existing = ["cafe-order", "doctor-visit", "hotel-checkin", "small-talk"];
    for (const { slug, courseTemplate } of loadScenarioContent()) {
      if (existing.includes(slug)) continue;
      expect(courseTemplate?.learningPack?.languageNotes, slug).toHaveLength(1);
      expect(
        courseTemplate?.targetPatterns.filter((pattern) => pattern.translation),
        slug,
      ).toHaveLength(8);
      expect(courseTemplate?.learningPack?.guidedPractice, slug).toHaveLength(3);
    }
  });
});

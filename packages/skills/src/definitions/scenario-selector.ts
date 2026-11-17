// ScenarioSelector - picks the scenario for a new lesson.
// Rule-based per blueprint (no LLM): scores goals against scenario metadata.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { SkillContext } from "../context";

const inputSchema = z.object({
  candidates: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      category: z.string(),
      difficulty: z.string(),
      objectives: z.array(z.string()),
      targetVocabulary: z.array(z.string()),
    }),
  ),
  studentGoals: z.array(z.string()),
  studentLevel: z.string(),
});

const outputSchema = z.object({
  scenarioId: z.string(),
  rationale: z.string(),
});

export type ScenarioSelectorInput = z.infer<typeof inputSchema>;
export type ScenarioSelectorOutput = z.infer<typeof outputSchema>;

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function levelDistance(a: string, b: string): number {
  const ia = LEVEL_ORDER.indexOf(a);
  const ib = LEVEL_ORDER.indexOf(b);
  if (ia < 0 || ib < 0) return 3;
  return Math.abs(ia - ib);
}

function score(
  scenario: ScenarioSelectorInput["candidates"][number],
  input: ScenarioSelectorInput,
): number {
  let score = 0;
  const haystack = [scenario.title, scenario.category, ...scenario.objectives]
    .join(" ")
    .toLowerCase();
  for (const goal of input.studentGoals) {
    const words = goal
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (const word of words) {
      if (haystack.includes(word)) score += 2;
    }
  }
  // Prefer scenarios close to the student level.
  score -= levelDistance(input.studentLevel, scenario.difficulty) * 3;
  return score;
}

export function createScenarioSelectorSkill(): SkillDefinition<
  ScenarioSelectorInput,
  ScenarioSelectorOutput
> {
  return {
    id: "skills.scenario_selector",
    version: "0.1.0",
    description: "Selects the best-fit scenario for a student using rule-based scoring.",
    inputSchema,
    outputSchema,
    async execute(input, _context: SkillContext) {
      if (input.candidates.length === 0) {
        throw new Error("scenario_selector: no candidate scenarios provided");
      }
      const ranked = [...input.candidates].sort((a, b) => score(b, input) - score(a, input));
      const best = ranked[0]!;
      return {
        scenarioId: best.id,
        rationale: `matched goals against "${best.title}" (${best.category}, ${best.difficulty})`,
      };
    },
  };
}

/** Deterministic mock: always picks the first candidate. */
export function createMockScenarioSelectorSkill(): SkillDefinition<
  ScenarioSelectorInput,
  ScenarioSelectorOutput
> {
  return {
    ...createScenarioSelectorSkill(),
    id: "skills.scenario_selector",
    async execute(input) {
      const best = input.candidates[0];
      if (!best) throw new Error("scenario_selector: no candidate scenarios provided");
      return { scenarioId: best.id, rationale: "mock: first candidate" };
    },
  };
}

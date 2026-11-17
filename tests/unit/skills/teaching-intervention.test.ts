import { describe, expect, it } from "vitest";
import {
  createMockTeachingInterventionSkill,
  createTeachingInterventionSkill,
  SkillRegistry,
  type SkillContext,
  type TeachingInterventionOutput,
} from "@language-lab/skills";
import { groundErrorDiagnosis } from "@language-lab/core";

describe("Teaching Intervention boundary", () => {
  it("uses the same rules offline and connected without model or data ports", async () => {
    const input = {
      errors: groundErrorDiagnosis("I go yesterday.", {
        intent: "visit",
        errors: [
          { category: "tense", original: "I go", corrected: "I went", explanation: "Past tense." },
        ],
      }).errors,
      fluency: "not_assessed",
      hintsGiven: 0,
      correctionsGiven: 0,
      allObjectivesCompleted: false,
      objectiveCount: 5,
    };
    const outputs = [];
    for (const skill of [
      createTeachingInterventionSkill(),
      createMockTeachingInterventionSkill(),
    ]) {
      const registry = new SkillRegistry();
      registry.register(skill);
      outputs.push(
        await registry.call<TeachingInterventionOutput>(skill.id, input, {} as SkillContext),
      );
      await expect(
        registry.call(
          skill.id,
          {
            ...input,
            history: {
              version: 1,
              practiceTurns: 0,
              corrections: [{ practiceTurn: 1, key: "bad" }],
            },
          },
          {} as SkillContext,
        ),
      ).rejects.toThrow();
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]?.correction?.corrected).toBe("I went");
  });
});

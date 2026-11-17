import { describe, expect, it } from "vitest";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const gateway = createMockGateway();
const cafe = loadScenarioContent().find((c) => c.slug === "cafe-order")!;
describe("confirmed speech in the teaching loop", () => {
  it("assesses the confirmed words through the normal loop and persists provenance without audio or raw recognition", async () => {
    const source = await createTrainingSession(cafe, { mode: "demo" }, gateway);
    const utterance = getGuidedExample(source)!;
    const next = await runTrainingTurn(source, utterance, gateway, undefined, undefined, {
      providerId: "test-asr",
      language: "en",
      edited: true,
      confidence: 0.3,
    });
    expect(next.messages[1]).toMatchObject({
      content: utterance,
      speech: { providerId: "test-asr", edited: true, confidence: 0.3 },
    });
    expect(next.state.objectives[0]!.completed).toBe(true);
    expect(next.diagnoses![0]!.diagnosis.fluency).toBe("not_assessed");
    expect(next.learningMemory!.practiceTurns).toBe(1);
    expect(next.lastTurn!.assessment!.criteria[0]!.evidence[0]!.quote).toBe(utterance);
    const saved = trainingSessionSchema.parse(JSON.parse(JSON.stringify(next)));
    expect(saved.messages[1]!.speech).toEqual(next.messages[1]!.speech);
    expect(JSON.stringify(saved)).not.toMatch(/audio\/|base64|recognizedText/);
    expect(source.state.turnCount).toBe(0);
  });
  it("rejects wrong-language or invalid metadata and speech attached to a partner reply", async () => {
    const source = await createTrainingSession(cafe, { mode: "demo" }, gateway);
    await expect(
      runTrainingTurn(source, "Hello", gateway, undefined, undefined, {
        providerId: "test",
        language: "fr",
        edited: false,
      }),
    ).rejects.toThrow(/Speech input language/);
    await expect(
      runTrainingTurn(source, "Hello", gateway, undefined, undefined, {
        providerId: "test",
        language: "en",
        edited: false,
        confidence: 4,
      }),
    ).rejects.toThrow();
    const forged = structuredClone(source);
    forged.messages[0]!.speech = { providerId: "test", language: "en", edited: false };
    expect(trainingSessionSchema.safeParse(forged).success).toBe(false);
    expect(source.state.turnCount).toBe(0);
  });
  it("keeps existing text checkpoints readable and applies speech support requests without awarding practice", async () => {
    const source = await createTrainingSession(cafe, { mode: "demo" }, gateway);
    expect(
      trainingSessionSchema.parse(JSON.parse(JSON.stringify(source))).messages[0]!.speech,
    ).toBeUndefined();
    const support = await runTrainingTurn(
      source,
      "Please repeat your last reply.",
      gateway,
      undefined,
      undefined,
      { providerId: "test", language: "en", edited: false },
    );
    expect(support.messages[1]!.purpose).toBe("support");
    expect(support.learningMemory!.practiceTurns).toBe(0);
    expect(support.state.objectives.every((o) => !o.completed)).toBe(true);
  });
});

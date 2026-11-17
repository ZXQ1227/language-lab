import { describe, expect, it } from "vitest";
import { createMockGateway } from "@language-lab/model-gateway";
import { summarizeVocabulary } from "@language-lab/core";
import {
  createTrainingSession,
  dialogueSupportText,
  runTrainingTurn,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;
const gateway = createMockGateway();

describe("evidence-backed vocabulary checkpoints", () => {
  it("persists canonical counts once per turn and cites all original occurrences", async () => {
    let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    session = await runTrainingTurn(
      session,
      "Two key cards, please. Key cards and a lift.",
      gateway,
    );
    expect(session.state.vocabularySeen).toEqual({ "key card": 1, elevator: 1 });
    const event = session.events.find(
      (item) => item.type === "vocabulary_used" && item.payload?.word === "key card",
    );
    expect(event?.payload?.messageSeq).toBe(1);
    expect(event?.payload?.matches).toHaveLength(2);
    const repeated = await runTrainingTurn(session, dialogueSupportText.repeat, gateway);
    expect(repeated.state.vocabularySeen).toEqual(session.state.vocabularySeen);
    const restored = trainingSessionSchema.parse(JSON.parse(JSON.stringify(repeated)));
    const next = await runTrainingTurn(restored, "My key card, please.", gateway);
    expect(next.state.vocabularySeen).toEqual({ "key card": 2, elevator: 1 });
    expect(next.vocabularyTrackingVersion).toBe(1);
  });

  it("rejects fabricated counts in a versioned checkpoint", async () => {
    const initial = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    const fake = { ...initial, state: { ...initial.state, vocabularySeen: { reservation: 4 } } };
    expect(trainingSessionSchema.safeParse(fake).success).toBe(false);
    expect(initial.state.vocabularySeen).toEqual({});
  });

  it("upgrades legacy substring-era counts by replay only when the next turn succeeds", async () => {
    let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    session = await runTrainingTurn(session, "Check out is at eleven.", gateway);
    const legacy = trainingSessionSchema.parse({
      ...session,
      vocabularyTrackingVersion: undefined,
      state: { ...session.state, vocabularySeen: { "check-out": 9, id: 20 } },
    });
    const before = JSON.stringify(legacy);
    await expect(runTrainingTurn(legacy, "", gateway)).rejects.toThrow();
    expect(JSON.stringify(legacy)).toBe(before);
    const updated = await runTrainingTurn(legacy, "My deposit, please.", gateway);
    expect(updated.state.vocabularySeen).toEqual({ "check-out": 1, deposit: 1 });
    expect(updated.vocabularyTrackingVersion).toBe(1);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(
      summarizeVocabulary(updated.state.targetVocabulary, updated.messages).find(
        (item) => item.term === "check-out",
      )?.usedTurns,
    ).toBe(1);
  });
});

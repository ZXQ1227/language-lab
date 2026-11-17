import { describe, expect, it } from "vitest";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  dialogueSupportText,
  runTrainingTurn,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;
const gateway = createMockGateway();
const start = () => createTrainingSession(hotel, { mode: "demo" }, gateway);

describe("gentle correction timing across saved practice", () => {
  it("spaces corrections and distinguishes a repeated issue from a new one", async () => {
    let session = await runTrainingTurn(await start(), "I go yesterday.", gateway);
    expect(session.messages.at(-1)?.content).toContain("I went");
    expect(session.diagnoses?.at(-1)?.interventionReason).toBe("correct_error");
    session = await runTrainingTurn(session, dialogueSupportText.repeat, gateway);
    session = trainingSessionSchema.parse(JSON.parse(JSON.stringify(session)));
    expect(session.state.interventionState?.practiceTurns).toBe(1);
    session = await runTrainingTurn(session, "I am agree.", gateway);
    expect(session.diagnoses?.at(-1)?.interventionReason).toBe("correction_spacing");
    expect(session.state.correctionsGiven).toBe(1);
    session = await runTrainingTurn(session, "I go yesterday.", gateway);
    expect(session.diagnoses?.at(-1)?.interventionReason).toBe("recently_corrected");
    session = await runTrainingTurn(session, "I am agree.", gateway);
    expect(session.diagnoses?.at(-1)?.interventionReason).toBe("correct_error");
    expect(session.messages.at(-1)?.content).toContain("I agree");
    expect(session.state.correctionsGiven).toBe(2);
    expect(session.state.hintsGiven).toBe(0);
    expect(session.state.objectives.every((objective) => !objective.completed)).toBe(true);
  });

  it("does not let several help exchanges consume the correction spacing", async () => {
    let session = await runTrainingTurn(await start(), "I go yesterday.", gateway);
    for (let index = 0; index < 4; index++)
      session = await runTrainingTurn(session, dialogueSupportText.repeat, gateway);
    expect(session.state.turnCount).toBe(5);
    expect(session.state.interventionState?.practiceTurns).toBe(1);
    session = await runTrainingTurn(session, "I am agree.", gateway);
    expect(session.diagnoses?.at(-1)?.interventionReason).toBe("correction_spacing");
    expect(session.state.correctionsGiven).toBe(1);
  });

  it("rejects fabricated timing history and a correction missing from the saved reply", async () => {
    const session = await runTrainingTurn(await start(), "I go yesterday.", gateway);
    const wrongHistory = JSON.parse(JSON.stringify(session));
    wrongHistory.state.interventionState.corrections[0].key = "invented";
    expect(trainingSessionSchema.safeParse(wrongHistory).success).toBe(false);
    const omitted = JSON.parse(JSON.stringify(session));
    omitted.messages[2].content = "Do you have a reservation?";
    expect(trainingSessionSchema.safeParse(omitted).success).toBe(false);
  });

  it("hydrates old recorded deliveries privately without resetting the correction budget", async () => {
    const session = await runTrainingTurn(await start(), "I go yesterday.", gateway);
    const legacy = JSON.parse(JSON.stringify(session));
    delete legacy.state.interventionState;
    delete legacy.diagnoses[0].interventionReason;
    const old = trainingSessionSchema.parse(legacy);
    const before = JSON.stringify(old);
    const next = await runTrainingTurn(old, "I am agree.", gateway);
    expect(next.state.correctionsGiven).toBe(1);
    expect(next.diagnoses?.at(-1)?.interventionReason).toBe("correction_spacing");
    expect(next.state.interventionState?.practiceTurns).toBe(2);
    expect(JSON.stringify(old)).toBe(before);
  });
});

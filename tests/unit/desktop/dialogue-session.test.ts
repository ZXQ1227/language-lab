import { describe, expect, it, vi } from "vitest";
import { configureScenarioContent } from "@language-lab/core";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  createTrainingSession,
  dialogueSupportText,
  getGuidedExample,
  runTrainingTurn,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;
const diagnosis = { errors: [], fluency: "fluent", intent: "continue check-in" };
const pending = {
  stageId: "find-reservation",
  relevance: "in_scene",
  criteria: [0, 1].map((criterionIndex) => ({ criterionIndex, met: false, evidence: [] })),
  feedback: "Please provide the reservation name and stay length.",
};

describe("dialogue state in Training", () => {
  it("persists grounded preferences beyond recent history and gives them back to the character", async () => {
    const first = "I would prefer a quiet room.";
    const llm = new MockLlmProvider(
      {},
      [
        pending,
        diagnosis,
        {
          reply: "Of course. What name is your reservation under?",
          tone: "encouraging",
          move: "follow_up",
          memoryUpdates: [{ id: "room-preference", messageSeq: 1, quote: first }],
        },
        pending,
        diagnosis,
        {
          reply: "I have noted your preference. How long are you staying?",
          tone: "neutral",
          move: "follow_up",
        },
      ].map((item) => JSON.stringify(item)),
    );
    const generation = vi.spyOn(llm, "generateStructured");
    const gateway = createGateway({ llm });
    let session = await createTrainingSession(
      hotel,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      gateway,
    );
    session = await runTrainingTurn(session, first, gateway);
    const saved = JSON.parse(JSON.stringify(session));
    for (let index = 0; index < 20; index++) {
      saved.messages.push({
        seq: saved.messages.length,
        role: "user",
        content: `A practice reply ${index}.`,
      });
      saved.messages.push({
        seq: saved.messages.length,
        role: "assistant",
        content: `A partner response ${index}.`,
      });
      saved.state.turnCount++;
      saved.state.interventionState.practiceTurns++;
    }
    delete saved.learningMemory;
    session = trainingSessionSchema.parse(saved);
    const next = await runTrainingTurn(session, "What information do you need?", gateway);
    const request = generation.mock.calls[5]![0];
    expect(request.messages[0]?.content).toContain(first);
    expect(request.messages[0]?.content).toContain("Character: Maya");
    expect(request.messages.slice(1).some((message) => message.content.includes(first))).toBe(
      false,
    );
    expect(next.state.dialogueMemory).toEqual(session.state.dialogueMemory);
    expect(next.state.lastDialogueMove).toBe("follow_up");
    const corrupted = JSON.parse(JSON.stringify(next));
    corrupted.state.dialogueMemory[0].messageSeq = 0;
    expect(trainingSessionSchema.safeParse(corrupted).success).toBe(false);
  });

  it("rejects invented character memory without committing the drafted turn", async () => {
    const gateway = createGateway({
      llm: new MockLlmProvider(
        {},
        [
          pending,
          diagnosis,
          {
            reply: "How long are you staying?",
            tone: "neutral",
            memoryUpdates: [{ id: "guest-name", messageSeq: 1, quote: "I am Sam" }],
          },
        ].map((item) => JSON.stringify(item)),
      ),
    });
    const initial = await createTrainingSession(
      hotel,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      gateway,
    );
    const before = JSON.stringify(initial);
    await expect(runTrainingTurn(initial, "Hello", gateway)).rejects.toThrow(
      "existing learner practice message",
    );
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("repeats and hints without awarding objectives, vocabulary or error records", async () => {
    const gateway = createMockGateway();
    const initial = await createTrainingSession(
      configureScenarioContent(hotel, { teachingPolicy: { maxHints: 1 } }),
      { mode: "demo" },
      gateway,
    );
    const repeated = await runTrainingTurn(initial, dialogueSupportText.repeat, gateway);
    expect(repeated.messages.at(-1)?.content).toBe(initial.messages[0]?.content);
    expect(repeated.messages[1]?.purpose).toBe("support");
    expect(repeated.messages[2]?.purpose).toBe("support");
    expect(repeated.lastTurn?.supportRequest).toBe("repeat");
    const hinted = await runTrainingTurn(repeated, dialogueSupportText.hint, gateway, "hint");
    expect(hinted.state.hintsGiven).toBe(1);
    expect(hinted.state.phase).toBe("briefing");
    expect(hinted.state.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(hinted.state.vocabularySeen).toEqual({});
    expect(hinted.events.every((event) => event.type === "dialogue_support_requested")).toBe(true);
    expect(getGuidedExample(hinted)).toBe(getGuidedExample(initial));
    await expect(
      runTrainingTurn(hinted, dialogueSupportText.hint, gateway, "hint"),
    ).rejects.toThrow("hint budget is exhausted");
    expect(trainingSessionSchema.parse(JSON.parse(JSON.stringify(hinted)))).toEqual(hinted);
  });

  it("uses only dialogue for a simpler-English request and does not change difficulty", async () => {
    const llm = new MockLlmProvider({}, [
      JSON.stringify({
        reply: "Welcome! Do you have a booking?",
        tone: "encouraging",
        move: "simplify",
      }),
    ]);
    const generation = vi.spyOn(llm, "generateStructured");
    const gateway = createGateway({ llm });
    const initial = await createTrainingSession(
      hotel,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      gateway,
    );
    const simplified = await runTrainingTurn(
      initial,
      dialogueSupportText.simplify,
      gateway,
      "simplify",
    );
    expect(generation).toHaveBeenCalledTimes(1);
    expect(simplified.state.difficulty).toBe(initial.state.difficulty);
    expect(simplified.state.stageAssessments).toBeUndefined();
    expect(simplified.lastTurn?.move).toBe("simplify");
    expect(simplified.messages[1]?.purpose).toBe("support");
  });

  it("does not let a later assessment cite a saved help request as learner evidence", async () => {
    const llm = new MockLlmProvider(
      {},
      [
        { reply: "Start by giving the reservation name.", tone: "encouraging", move: "hint" },
        {
          ...pending,
          criteria: [0, 1].map((criterionIndex) => ({
            criterionIndex,
            met: true,
            evidence: [{ messageSeq: 1, quote: dialogueSupportText.hint }],
          })),
        },
      ].map((item) => JSON.stringify(item)),
    );
    const gateway = createGateway({ llm });
    const initial = await createTrainingSession(
      hotel,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      gateway,
    );
    const hinted = await runTrainingTurn(initial, dialogueSupportText.hint, gateway, "hint");
    const before = JSON.stringify(hinted);
    await expect(runTrainingTurn(hinted, "Hello", gateway)).rejects.toThrow(
      "existing learner message exactly",
    );
    expect(JSON.stringify(hinted)).toBe(before);
  });
});

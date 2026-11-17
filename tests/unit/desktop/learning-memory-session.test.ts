import { describe, expect, it, vi } from "vitest";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
import {
  defaultProfileMemory,
  projectLearningMemory,
  selectLearningMemory,
} from "@language-lab/memory";
import {
  createTrainingSession,
  dialogueSupportText,
  finishTrainingSession,
  getGuidedExample,
  runTrainingTurn,
  trainingSessionSchema,
} from "../../../apps/desktop/src/training/session";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";

const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;
const gateway = createMockGateway();

describe("learning contributions from Training evidence", () => {
  it("records learner observations only, while preserving an explicit profile", async () => {
    let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    session = await runTrainingTurn(session, "I go yesterday. I have a reservation.", gateway);
    const first = session.learningMemory!;
    expect(first.knowledge.find((item) => item.term === "reservation")?.usedTurns).toBe(1);
    expect(first.errors[0]).toMatchObject({ count: 1, guidedCount: 1, modelCount: 0 });
    session = await runTrainingTurn(session, dialogueSupportText.repeat, gateway);
    expect(session.learningMemory?.practiceTurns).toBe(1);
    expect(session.learningMemory?.errors).toEqual(first.errors);
    expect(session.learningMemory?.knowledge).toEqual(first.knowledge);
    const profile = { targetLanguage: "en", level: "B2" as const, goals: ["Travel conversations"] };
    const memory = projectLearningMemory(profile, [first, session.learningMemory!], true);
    expect(memory.episodes).toHaveLength(1);
    expect(memory.profile).toEqual(profile);
    expect(JSON.stringify(memory.profile)).not.toContain("Alex Chen");
    expect(memory.knowledge.every((item) => item.mastery !== ("mastered" as string))).toBe(true);
  });

  it("finishes and restores one episode without promoting guided practice to independent mastery", async () => {
    let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    for (let index = 0; index < hotel.courseTemplate!.stages.length; index++)
      session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
    expect(session.learningMemory?.completed).toBe(false);
    session = await finishTrainingSession(session, gateway);
    session = trainingSessionSchema.parse(JSON.parse(JSON.stringify(session)));
    const memory = projectLearningMemory(defaultProfileMemory(), [
      session.learningMemory!,
      session.learningMemory!,
    ]);
    expect(memory.episodes).toHaveLength(1);
    expect(memory.episodes[0]?.completed).toBe(true);
    expect(memory.episodes[0]?.summary).toContain("not independent assessment");
    expect(memory.knowledge.find((item) => item.item === "reservation")?.mastery).toBe("learning");
    expect(memory.profileSaved).toBe(false);
  });

  it("rejects invented memory projections and reads old checkpoints without them", async () => {
    const initial = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    const fake = JSON.parse(JSON.stringify(initial));
    fake.learningMemory.knowledge[0].usedTurns = 1;
    fake.learningMemory.knowledge[0].occurrences = 1;
    fake.learningMemory.knowledge[0].latest = { messageSeq: 1, quote: "reservation" };
    expect(trainingSessionSchema.safeParse(fake).success).toBe(false);
    const old = trainingSessionSchema.parse({ ...initial, learningMemory: undefined });
    const next = await runTrainingTurn(old, "I have a reservation.", gateway);
    expect(next.learningMemory?.knowledge[0]?.usedTurns).toBe(1);
    expect(old.learningMemory).toBeUndefined();
  });

  it("loads all four memory types into another lesson's bounded partner context without changing its level", async () => {
    const previous = await runTrainingTurn(
      await createTrainingSession(hotel, { mode: "demo" }, gateway),
      "I go yesterday. I have a reservation.",
      gateway,
    );
    const document = projectLearningMemory(
      { targetLanguage: "en", level: "C1", goals: ["Travel conversations"] },
      [previous.learningMemory!],
      true,
    );
    const snapshot = selectLearningMemory(document, "en", hotel.targetVocabulary);
    const llm = new MockLlmProvider(
      {},
      [
        { intent: "check in", errors: [] },
        {
          stageId: "find-reservation",
          criteria: [0, 1].map((criterionIndex) => ({ criterionIndex, met: false, evidence: [] })),
          feedback: "Please give your booking name.",
        },
        { reply: "What name is your booking under?", tone: "encouraging" },
      ].map((value) => JSON.stringify(value)),
    );
    const generation = vi.spyOn(llm, "generateStructured");
    const connected = createGateway({ llm });
    const initial = await createTrainingSession(
      hotel,
      { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" },
      connected,
      snapshot,
    );
    const next = await runTrainingTurn(initial, "Hello again.", connected, undefined, snapshot);
    const prompt = generation.mock.calls[2]![0].messages[0]!.content;
    expect(prompt).toContain('"goals":["Travel conversations"]');
    expect(prompt).toContain('"item":"reservation"');
    expect(prompt).toContain('"guidedCount":1');
    expect(prompt).toContain('"observedPattern":"I go → I went"');
    expect(prompt).toContain('"summary":"Practised Hotel Check-in');
    expect(prompt).toContain("Student level: A2 en");
    expect(prompt).toContain("historical errors are not evidence of new errors");
    expect(next.state.difficulty).toBe("A2");
    expect(next.state.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(next.diagnoses?.[0]?.diagnosis.errors).toEqual([]);
  });
});

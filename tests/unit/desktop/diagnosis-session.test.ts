import { describe, expect, it, vi } from "vitest";
import { configureScenarioContent } from "@language-lab/core";
import { createGateway, createMockGateway, MockLlmProvider } from "@language-lab/model-gateway";
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
const pending = {
  stageId: "find-reservation",
  relevance: "in_scene",
  criteria: [0, 1].map((criterionIndex) => ({ criterionIndex, met: false, evidence: [] })),
  feedback: "Please give your booking name and stay length.",
};
const utterance = "I go yesterday and I have a reserve.";
const diagnosis = {
  intent: "check in",
  fluency: "halting",
  errors: [
    {
      category: "tense",
      original: "I go",
      corrected: "I went",
      explanation: "Use past tense with yesterday.",
      confidence: "high",
      severity: "form",
    },
    {
      category: "vocabulary",
      original: "reserve",
      corrected: "reservation",
      explanation: "A hotel booking is a reservation.",
      confidence: "high",
      severity: "meaning",
    },
  ],
};
const provider = { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "test" };
const gatewayFor = (...responses: unknown[]) =>
  createGateway({
    llm: new MockLlmProvider(
      {},
      responses.map((response) => JSON.stringify(response)),
    ),
  });
const reply = (text: string) => ({ reply: text, tone: "encouraging" });

describe("grounded language feedback checkpoints", () => {
  it("selects the meaning issue, keeps original practice and persists feedback across help and restore", async () => {
    const llm = new MockLlmProvider(
      {},
      [pending, diagnosis, reply("A hotel booking is a reservation. What name is it under?")].map(
        (value) => JSON.stringify(value),
      ),
    );
    const generation = vi.spyOn(llm, "generateStructured");
    const gateway = createGateway({ llm });
    const initial = await createTrainingSession(hotel, provider, gateway);
    const next = await runTrainingTurn(initial, utterance, gateway);
    expect(next.messages[1]?.content).toBe(utterance);
    expect(next.state.vocabularySeen).toEqual({});
    expect(next.state.objectives.every((objective) => !objective.completed)).toBe(true);
    expect(next.state.correctionsGiven).toBe(1);
    expect(next.state.hintsGiven).toBe(0);
    expect(next.diagnoses?.[0]).toMatchObject({
      messageSeq: 1,
      correctionIndex: 0,
      diagnosis: {
        source: "model",
        fluency: "not_assessed",
        errors: [{ category: "vocabulary" }, { category: "tense" }],
      },
    });
    expect(generation.mock.calls[2]![0].messages[0]?.content).toContain(
      '"reserve" -> "reservation"',
    );
    expect(next.events.filter((event) => event.type === "error_made")).toHaveLength(2);
    const helped = await runTrainingTurn(next, dialogueSupportText.repeat, gateway);
    expect(helped.diagnoses).toEqual(next.diagnoses);
    expect(trainingSessionSchema.parse(JSON.parse(JSON.stringify(helped))).diagnoses).toEqual(
      next.diagnoses,
    );
  });

  it("diagnoses without exceeding correction budgets or turning text errors into fluency hints", async () => {
    const second = {
      intent: "agree",
      fluency: "halting",
      errors: [
        {
          category: "grammar",
          original: "I am agree",
          corrected: "I agree",
          explanation: "Agree is a verb.",
        },
      ],
    };
    const gateway = gatewayFor(
      pending,
      diagnosis,
      reply("Use reservation for a hotel booking. What is your name?"),
      pending,
      second,
      reply("Thank you. How many nights are you staying?"),
    );
    let session = await createTrainingSession(
      configureScenarioContent(hotel, { teachingPolicy: { maxCorrections: 1 } }),
      provider,
      gateway,
    );
    session = await runTrainingTurn(session, utterance, gateway);
    session = await runTrainingTurn(session, "I am agree.", gateway);
    expect(session.state.correctionsGiven).toBe(1);
    expect(session.state.hintsGiven).toBe(0);
    expect(session.lastTurn?.action).toBe("continue_conversation");
    expect(session.diagnoses?.[1]?.diagnosis.errors).toHaveLength(1);
    expect(session.diagnoses?.[1]?.correctionIndex).toBeUndefined();
    const offGateway = gatewayFor(pending, diagnosis, reply("What name is your booking under?"));
    const off = await runTrainingTurn(
      await createTrainingSession(
        configureScenarioContent(hotel, { teachingPolicy: { correctionMode: "off" } }),
        provider,
        offGateway,
      ),
      utterance,
      offGateway,
    );
    expect(off.state.correctionsGiven).toBe(0);
    expect(off.diagnoses?.[0]?.correctionIndex).toBeUndefined();
  });

  it("rejects ungrounded provider diagnoses without publishing a drafted turn", async () => {
    const invalid = {
      ...diagnosis,
      errors: [{ ...diagnosis.errors[0], original: "invented words" }],
    };
    const gateway = gatewayFor(pending, invalid, invalid);
    const initial = await createTrainingSession(hotel, provider, gateway);
    const before = JSON.stringify(initial);
    await expect(runTrainingTurn(initial, utterance, gateway)).rejects.toThrow(
      "could not be validated",
    );
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("rejects corrupted citations and keeps legacy feedback readable without inventing history", async () => {
    const gateway = gatewayFor(pending, diagnosis, reply("What name is the reservation under?"));
    const saved = await runTrainingTurn(
      await createTrainingSession(hotel, provider, gateway),
      utterance,
      gateway,
    );
    const corrupt = JSON.parse(JSON.stringify(saved));
    corrupt.diagnoses[0].diagnosis.errors[0].start++;
    expect(trainingSessionSchema.safeParse(corrupt).success).toBe(false);
    const assistantCitation = JSON.parse(JSON.stringify(saved));
    assistantCitation.diagnoses[0].messageSeq = 0;
    expect(trainingSessionSchema.safeParse(assistantCitation).success).toBe(false);
    const legacy = trainingSessionSchema.parse({
      ...saved,
      diagnoses: undefined,
      learningMemory: undefined,
      state: { ...saved.state, interventionState: undefined },
    });
    expect(legacy.diagnoses).toBeUndefined();
    expect(legacy.lastTurn?.errors[0]?.corrected).toBe("reservation");
  });

  it("keeps limited demo observations through a completed course and review", async () => {
    const gateway = createMockGateway();
    let session = await createTrainingSession(hotel, { mode: "demo" }, gateway);
    session = await runTrainingTurn(session, "I go yesterday.", gateway);
    for (let index = 0; index < hotel.courseTemplate!.stages.length; index++)
      session = await runTrainingTurn(session, getGuidedExample(session)!, gateway);
    session = await finishTrainingSession(session, gateway);
    expect(session.state.phase).toBe("done");
    expect(session.diagnoses?.[0]?.diagnosis.source).toBe("demo");
    expect(session.diagnoses?.[0]?.correctionIndex).toBe(0);
    expect(session.diagnoses).toHaveLength(6);
    expect(trainingSessionSchema.parse(JSON.parse(JSON.stringify(session)))).toEqual(session);
  });
});

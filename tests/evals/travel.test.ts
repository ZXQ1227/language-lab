import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { createGateway, MockLlmProvider } from "@language-lab/model-gateway";
import { getCurrentCourseStage } from "@language-lab/core";
import { loadScenarioContent } from "../../apps/desktop/src/content/scenarioContent";
import { createTrainingSession, runTrainingTurn } from "../../apps/desktop/src/training/session";
import raw from "../../content/evaluation/travel-stage-cases.json";

const correctionSchema = z.strictObject({
  original: z.string().min(1),
  corrected: z.string().min(1),
});
const benchmark = z
  .strictObject({
    version: z.literal(1),
    cases: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          scenario: z.string().min(1),
          stageId: z.string().min(1),
          utterance: z.string().min(1),
          criteria: z.array(z.boolean()).min(1),
          allowedCorrections: z.array(correctionSchema),
          rationale: z.string().min(1),
        }),
      )
      .min(1),
  })
  .parse(raw);
const observationSchema = z.strictObject({
  id: z.string().min(1),
  criteria: z.array(z.boolean()).nullable(),
  stageAdvanced: z.boolean(),
  correction: correctionSchema.nullable(),
  validReplyMs: z.number().nonnegative().nullable(),
});
const manualSchema = z.strictObject({
  cases: z.array(observationSchema),
  nextDay: z
    .strictObject({
      eligible: z.number().int().nonnegative(),
      completedOnTime: z.number().int().nonnegative(),
    })
    .refine((value) => value.completedOnTime <= value.eligible)
    .nullable(),
});
type Observation = z.infer<typeof observationSchema>;

// Independent canned responses exercise both correct results and deliberate judge errors.
const replay: Record<
  string,
  {
    criteria: boolean[];
    reply: string;
    correction?: z.infer<typeof correctionSchema>;
  }
> = {
  "hotel-complete": { criteria: [true, true], reply: "Thanks. Do you have a room preference?" },
  "hotel-partial": { criteria: [true, true], reply: "Thanks. Do you have a room preference?" },
  "hotel-wrong-duration": {
    criteria: [true, false],
    reply: "Could you double-check the duration?",
  },
  "hotel-light-correction": {
    criteria: [true, true],
    reply: "You can say I have a reservation. Do you have a room preference?",
    correction: { original: "I has", corrected: "I have" },
  },
  "airport-equivalent": { criteria: [false], reply: "Could you tell me your seat preference?" },
  "airport-other-seat": {
    criteria: [false],
    reply: "I can check window seats as well as aisle seats.",
  },
  "restaurant-natural": {
    criteria: [true],
    reply: "What is on special today? It's grilled salmon.",
    correction: { original: "What's", corrected: "What is" },
  },
  "restaurant-other-request": {
    criteria: [false],
    reply: "Of course. Would you like to ask about the menu?",
  },
};

async function replayCase(sample: (typeof benchmark.cases)[number]): Promise<Observation> {
  const { criteria, reply, correction } = replay[sample.id]!;
  const scenario = loadScenarioContent().find((course) => course.slug === sample.scenario)!;
  const gateway = createGateway({
    llm: new MockLlmProvider(
      {},
      [
        {
          stageId: sample.stageId,
          relevance: "in_scene",
          feedback: "Case assessment.",
          criteria: criteria.map((met, criterionIndex) => ({
            met,
            criterionIndex,
            evidence: met ? [{ messageSeq: 1, quote: sample.utterance }] : [],
          })),
        },
        {
          intent: "travel practice",
          errors: correction
            ? [
                {
                  ...correction,
                  category: "grammar",
                  confidence: "high",
                  severity: "form",
                  explanation: "Try this wording.",
                },
              ]
            : [],
        },
        { reply, tone: "neutral" },
      ].map((response) => JSON.stringify(response)),
    ),
  });
  const session = await createTrainingSession(
    scenario,
    { mode: "ai", baseUrl: "http://localhost:11434/v1", model: "scripted-eval" },
    gateway,
  );
  expect(getCurrentCourseStage(session.state)?.id).toBe(sample.stageId);
  expect(getCurrentCourseStage(session.state)?.successCriteria).toHaveLength(
    sample.criteria.length,
  );
  const start = performance.now();
  const next = await runTrainingTurn(session, sample.utterance, gateway);
  const assessment = next.lastTurn?.assessment;
  const delivered = next.diagnoses?.find((item) => item.correctionIndex !== undefined);
  const actual = delivered?.diagnosis.errors[delivered.correctionIndex!];
  const finalMessage = next.messages.at(-1);
  return {
    id: sample.id,
    criteria: assessment
      ? [...assessment.criteria]
          .sort((a, b) => a.criterionIndex - b.criterionIndex)
          .map(({ met }) => met)
      : null,
    stageAdvanced: getCurrentCourseStage(next.state)?.id !== sample.stageId,
    correction: actual ? { original: actual.original, corrected: actual.corrected } : null,
    validReplyMs:
      finalMessage?.role === "assistant" && finalMessage.seq > session.messages.length
        ? Math.round(performance.now() - start)
        : null,
  };
}

function score(observations: Observation[]) {
  expect(observations.map((item) => item.id).sort()).toEqual(
    benchmark.cases.map((item) => item.id).sort(),
  );
  let criterionCount = 0;
  let stageFalsePasses = 0;
  let stageFalseMisses = 0;
  let criterionFalsePasses = 0;
  let criterionFalseMisses = 0;
  let lightCorrectionFalsePositives = 0;
  const timings: number[] = [];
  for (const actual of observations) {
    const gold = benchmark.cases.find((sample) => sample.id === actual.id)!;
    const shouldAdvance = gold.criteria.every(Boolean);
    if (actual.stageAdvanced && !shouldAdvance) stageFalsePasses++;
    if (!actual.stageAdvanced && shouldAdvance) stageFalseMisses++;
    if (actual.criteria) {
      expect(actual.criteria).toHaveLength(gold.criteria.length);
      criterionCount += gold.criteria.length;
      for (const [index, met] of actual.criteria.entries()) {
        if (met && !gold.criteria[index]) criterionFalsePasses++;
        if (!met && gold.criteria[index]) criterionFalseMisses++;
      }
    }
    if (
      actual.correction &&
      !gold.allowedCorrections.some(
        (candidate) =>
          candidate.original === actual.correction?.original &&
          candidate.corrected === actual.correction.corrected,
      )
    )
      lightCorrectionFalsePositives++;
    if (actual.validReplyMs !== null) timings.push(actual.validReplyMs);
  }
  timings.sort((a, b) => a - b);
  const percentile = (value: number) => timings[Math.ceil(timings.length * value) - 1] ?? null;
  return {
    cases: observations.length,
    assessedCriteria: criterionCount,
    unassessedTurns: observations.filter(({ criteria }) => criteria === null).length,
    stageFalsePasses,
    stageFalseMisses,
    criterionFalsePasses,
    criterionFalseMisses,
    shownLightCorrections: observations.filter(({ correction }) => correction !== null).length,
    lightCorrectionFalsePositives,
    validReplies: timings.length,
    validReplyP50Ms: percentile(0.5),
    validReplyP95Ms: percentile(0.95),
  };
}

it("compares travel teaching observations with the authored judgments", async () => {
  const path = process.env.SAYDEN_TRAVEL_OBSERVATIONS;
  const manual = path ? manualSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
  const cases = manual?.cases ?? [];
  if (!manual) {
    for (const sample of benchmark.cases) cases.push(await replayCase(sample));
  }
  const results = score(cases);
  if (!manual)
    expect(results).toMatchObject({
      cases: 8,
      assessedCriteria: 12,
      stageFalsePasses: 1,
      stageFalseMisses: 1,
      criterionFalsePasses: 1,
      criterionFalseMisses: 1,
      shownLightCorrections: 2,
      lightCorrectionFalsePositives: 1,
      validReplies: 8,
    });
  const nextDay = manual?.nextDay;
  console.info(
    JSON.stringify(
      {
        basis: manual ? "manual-connected" : "scripted-replay",
        ...results,
        nextDay: nextDay
          ? {
              ...nextDay,
              rate: nextDay.eligible ? nextDay.completedOnTime / nextDay.eligible : null,
            }
          : null,
        observations: cases,
      },
      null,
      2,
    ),
  );
});

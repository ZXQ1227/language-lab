import { describe, expect, it } from "vitest";
import {
  advanceInterventionState,
  correctionKey,
  decideTeachingIntervention,
  deriveInterventionState,
  groundErrorDiagnosis,
  interventionStateSchema,
  lightCorrectionReplyIssue,
  type InterventionState,
} from "@language-lab/core";

const errors = groundErrorDiagnosis("I go yesterday. I have a reserve.", {
  intent: "check in",
  errors: [
    { category: "tense", original: "I go", corrected: "I went", explanation: "Use past tense." },
    {
      category: "vocabulary",
      original: "reserve",
      corrected: "reservation",
      explanation: "Use reservation for a booking.",
      severity: "meaning",
    },
  ],
}).errors;
const empty: InterventionState = { version: 1, practiceTurns: 0, corrections: [] };
const input = {
  errors,
  fluency: "not_assessed" as const,
  hintsGiven: 0,
  correctionsGiven: 0,
  objectiveCount: 5,
  allObjectivesCompleted: false,
  history: empty,
  policy: { correctionMode: "gentle" as const, maxCorrections: 4, maxHints: 3 },
};

describe("deterministic gentle intervention", () => {
  it("chooses one short meaning issue even when the input order differs", () => {
    const result = decideTeachingIntervention({ ...input, errors: [...errors].reverse() });
    expect(result.action).toBe("light_correction");
    expect(result.correction?.corrected).toBe("reservation");
    expect(result.reason).toBe("correct_error");
  });

  it("leaves a practice turn for conversation and later chooses an unreminded issue", () => {
    let history = advanceInterventionState(empty, errors[0]);
    expect(decideTeachingIntervention({ ...input, history, correctionsGiven: 1 }).reason).toBe(
      "correction_spacing",
    );
    history = advanceInterventionState(history);
    const next = decideTeachingIntervention({ ...input, history, correctionsGiven: 1 });
    expect(next.correction?.corrected).toBe("I went");
  });

  it("suppresses an exact recent correction until four intervening practice replies", () => {
    let history = advanceInterventionState(empty, errors[0]);
    history = advanceInterventionState(history);
    for (let step = 3; step <= 5; step++) {
      expect(
        decideTeachingIntervention({ ...input, errors: [errors[0]!], history, correctionsGiven: 1 })
          .reason,
      ).toBe("recently_corrected");
      history = advanceInterventionState(history);
    }
    expect(
      decideTeachingIntervention({ ...input, errors: [errors[0]!], history, correctionsGiven: 1 })
        .action,
    ).toBe("light_correction");
  });

  it("respects configurable intervals, hard budgets, off mode and verified completion", () => {
    const history = advanceInterventionState(empty, errors[0]);
    expect(
      decideTeachingIntervention({
        ...input,
        history,
        policy: { ...input.policy, correctionCooldownTurns: 0, repeatCorrectionCooldownTurns: 0 },
      }).action,
    ).toBe("light_correction");
    expect(
      decideTeachingIntervention({ ...input, policy: { ...input.policy, correctionMode: "off" } })
        .reason,
    ).toBe("corrections_off");
    expect(decideTeachingIntervention({ ...input, correctionsGiven: 4 }).reason).toBe(
      "budget_exhausted",
    );
    expect(decideTeachingIntervention({ ...input, allObjectivesCompleted: true }).reason).toBe(
      "objectives_complete",
    );
    expect(decideTeachingIntervention({ ...input, errors: [] }).action).toBe(
      "continue_conversation",
    );
  });

  it("defers a long rewrite and never substitutes it for a light recast", () => {
    const long = {
      ...errors[0]!,
      original: "a".repeat(161),
      corrected: "b".repeat(161),
      start: 0,
      end: 161,
    };
    expect(decideTeachingIntervention({ ...input, errors: [long] }).reason).toBe("not_lightweight");
    expect(
      decideTeachingIntervention({ ...input, errors: [long, errors[1]!] }).correction?.corrected,
    ).toBe("I went");
  });

  it("reconstructs spacing from learner practice, excluding support and partner text", () => {
    const diagnosis = groundErrorDiagnosis("I go yesterday.", {
      intent: "visit",
      errors: [
        { category: "tense", original: "I go", corrected: "I went", explanation: "Past tense." },
      ],
    });
    const transcript = [
      { seq: 0, role: "assistant" as const, content: "Welcome." },
      { seq: 1, role: "user" as const, content: "I go yesterday." },
      { seq: 2, role: "assistant" as const, content: "You can say I went. Where did you go?" },
      { seq: 3, role: "user" as const, purpose: "support" as const, content: "Repeat that." },
      {
        seq: 4,
        role: "assistant" as const,
        purpose: "support" as const,
        content: "You can say I went. Where did you go?",
      },
      { seq: 5, role: "user" as const, content: "To the hotel." },
    ];
    const state = deriveInterventionState(transcript, [
      { messageSeq: 1, diagnosis, correctionIndex: 0 },
    ]);
    expect(state.practiceTurns).toBe(2);
    expect(state.corrections).toEqual([
      { practiceTurn: 1, key: correctionKey(diagnosis.errors[0]!) },
    ]);
    expect(
      interventionStateSchema.safeParse({
        ...state,
        corrections: [{ practiceTurn: 3, key: "bad" }],
      }).success,
    ).toBe(false);
  });

  it("uses an old long correction for timing without making it eligible for another recast", () => {
    const content = "a".repeat(200);
    const diagnosis = groundErrorDiagnosis(content, {
      intent: "visit",
      errors: [
        {
          category: "grammar",
          original: content,
          corrected: "b".repeat(200),
          explanation: "Legacy rewrite.",
        },
      ],
    });
    const history = deriveInterventionState(
      [{ seq: 1, role: "user", content }],
      [{ messageSeq: 1, diagnosis, correctionIndex: 0 }],
    );
    expect(history.corrections[0]?.practiceTurn).toBe(1);
    expect(decideTeachingIntervention({ ...input, history, correctionsGiven: 1 }).reason).toBe(
      "correction_spacing",
    );
  });

  it("requires the approved wording in a bounded reply, with whole-word boundaries", () => {
    const correction = errors[1]!;
    expect(
      lightCorrectionReplyIssue("You can say ‘I went’. What happened next?", correction),
    ).toBeUndefined();
    expect(lightCorrectionReplyIssue("What happened next?", correction)).toContain("omitted");
    expect(lightCorrectionReplyIssue("I went " + "x".repeat(600), correction)).toContain("600");
    const word = errors[0]!;
    expect(lightCorrectionReplyIssue("The reservationist can help.", word)).toContain("omitted");
    expect(correctionKey({ original: "Ｉ GO", corrected: "I WENT" })).toBe(
      correctionKey(correction),
    );
  });
});

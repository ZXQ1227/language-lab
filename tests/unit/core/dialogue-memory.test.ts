import { describe, expect, it } from "vitest";
import {
  detectDialogueSupport,
  mergeDialogueMemory,
  validateDialogueMemory,
  validateStageAssessment,
  scenarioContentSchema,
} from "@language-lab/core";
import hotel from "../../../content/scenarios/hotel-checkin.json";

describe("grounded dialogue memory", () => {
  it("recognises standalone help phrases without swallowing scene-specific questions or negation", () => {
    expect(detectDialogueSupport("Could you give me one hint?")).toBe("hint");
    expect(detectDialogueSupport("Please repeat your last reply.")).toBe("repeat");
    expect(detectDialogueSupport("Could you say that in simpler English?")).toBe("simplify");
    for (const utterance of [
      "Could you repeat the Wi-Fi password, please?",
      "Don't repeat that.",
      "Do I need to repeat the confirmation number?",
      "I do not need a hint.",
    ])
      expect(detectDialogueSupport(utterance)).toBeUndefined();
  });
  const first = { seq: 1, role: "user" as const, content: "I do not want a quiet room." };
  const changed = {
    seq: 3,
    role: "user" as const,
    content: "Actually, I would like a quiet room.",
  };
  const prior = [{ id: "room-preference", messageSeq: 1, quote: first.content }];

  it("preserves negation and accepts only a learner's later quoted update", () => {
    expect(() =>
      mergeDialogueMemory(
        [],
        [{ id: "room-preference", messageSeq: 1, quote: "quiet room" }],
        [first],
      ),
    ).toThrow("complete short learner message");
    const next = mergeDialogueMemory(
      prior,
      [{ id: "room-preference", messageSeq: 3, quote: changed.content }],
      [first, changed],
    );
    expect(next[0]?.quote).toBe(changed.content);
    expect(prior[0]?.quote).toBe(first.content);
    expect(() => mergeDialogueMemory(next, prior, [first, changed])).toThrow(
      "newer learner statement",
    );
  });

  it("does not accept assistant text or support requests as learner memory", () => {
    for (const message of [
      { ...first, role: "assistant" as const },
      { ...first, purpose: "support" as const },
    ]) {
      expect(() => validateDialogueMemory(prior, [message])).toThrow("learner practice message");
    }
    expect(() =>
      validateDialogueMemory([{ ...prior[0]!, quote: "invented name" }], [first]),
    ).toThrow();
  });

  it("keeps at most the latest twelve distinct details", () => {
    const transcript = Array.from({ length: 14 }, (_, index) => ({
      seq: index,
      role: "user" as const,
      content: `Detail ${index}`,
    }));
    const items = transcript.map((message) => ({
      id: `detail-${message.seq}`,
      messageSeq: message.seq,
      quote: message.content,
    }));
    const memory = mergeDialogueMemory(items.slice(0, 12), items.slice(12), transcript);
    expect(memory).toHaveLength(12);
    expect(memory[0]?.id).toBe("detail-2");
    expect(memory.at(-1)?.id).toBe("detail-13");
  });

  it("never accepts a help-control message as objective evidence", () => {
    const stage = scenarioContentSchema.parse(hotel).courseTemplate!.stages[0]!;
    const message = {
      seq: 1,
      role: "user" as const,
      purpose: "support" as const,
      content: "Alex Chen for two nights",
    };
    const assessment = {
      stageId: stage.id,
      criteria: stage.successCriteria.map((_, criterionIndex) => ({
        criterionIndex,
        met: true,
        evidence: [{ messageSeq: 1, quote: message.content }],
      })),
      feedback: "Complete",
    };
    expect(() => validateStageAssessment(assessment, stage, [message])).toThrow(
      "existing learner message exactly",
    );
  });
});

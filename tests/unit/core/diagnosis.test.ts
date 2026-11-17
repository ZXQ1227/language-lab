import { describe, expect, it } from "vitest";
import {
  errorDiagnosisSchema,
  groundErrorDiagnosis,
  validateDiagnosisRecords,
} from "@language-lab/core";

const tense = {
  category: "tense",
  original: "I go",
  corrected: "I went",
  explanation: "Use past tense with yesterday.",
};
const raw = (errors: unknown[]) => ({ errors, fluency: "fluent", intent: "describe a visit" });

describe("grounded error diagnosis", () => {
  it("rejects saved certainty claims that contradict uncertainty or limited demo checks", () => {
    const uncertain = groundErrorDiagnosis(
      "I go yesterday.",
      raw([{ ...tense, confidence: "medium" }]),
    );
    expect(errorDiagnosisSchema.safeParse({ ...uncertain, status: "checked" }).success).toBe(false);
    const demo = groundErrorDiagnosis("I go yesterday.", raw([tense]), "demo");
    expect(errorDiagnosisSchema.safeParse({ ...demo, status: "checked" }).success).toBe(false);
  });
  it("supports uniquely cited legacy errors without claiming text fluency", () => {
    const result = groundErrorDiagnosis("I go yesterday.", raw([tense]));
    expect(result.errors[0]).toMatchObject({
      start: 0,
      end: 4,
      confidence: "high",
      severity: "form",
    });
    expect(result.fluency).toBe("not_assessed");
    expect(result.source).toBe("model");
  });

  it("preserves Unicode UTF-16 offsets and allows a selected repeated phrase", () => {
    const utterance = "🧳 I go yesterday. I go every day.";
    const result = groundErrorDiagnosis(utterance, raw([{ ...tense, start: 3, end: 7 }]));
    expect(utterance.slice(result.errors[0]!.start, result.errors[0]!.end)).toBe("I go");
    expect(() => groundErrorDiagnosis(utterance, raw([tense]))).toThrow("ambiguous");
  });

  it.each([
    { ...tense, original: "I went" },
    { ...tense, start: 1, end: 5 },
    { ...tense, start: 0, end: 99 },
    { ...tense, start: 0, end: 0 },
    { ...tense, start: 0 },
    { ...tense, corrected: "I go" },
    { ...tense, corrected: "  I go  " },
    { ...tense, explanation: " " },
    { ...tense, original: " " },
  ])("rejects fabricated, empty, unchanged or invalid corrections: %j", (error) => {
    expect(() => groundErrorDiagnosis("I go yesterday.", raw([error]))).toThrow();
  });

  it("protects numeric details from a language rewrite", () => {
    for (const [original, corrected] of [
      ["-2 night", "2 nights"],
      ["٢ night", "٣ nights"],
    ]) {
      expect(() =>
        groundErrorDiagnosis(
          original!,
          raw([{ category: "grammar", original, corrected, explanation: "Use plural nights." }]),
        ),
      ).toThrow("numeric details");
    }
    expect(() =>
      groundErrorDiagnosis(
        "I stay 2 night.",
        raw([
          {
            category: "grammar",
            original: "2 night",
            corrected: "3 nights",
            explanation: "Use plural nights.",
          },
        ]),
      ),
    ).toThrow("numeric details");
    expect(
      groundErrorDiagnosis(
        "I stay 2 night.",
        raw([
          {
            category: "grammar",
            original: "2 night",
            corrected: "2 nights",
            explanation: "Use plural nights.",
          },
        ]),
      ).errors,
    ).toHaveLength(1);
  });

  it("withholds uncertain suggestions without creating language errors", () => {
    const result = groundErrorDiagnosis(
      "A booking for tomorrow.",
      raw([
        {
          category: "grammar",
          original: "unsupported",
          corrected: "Anything",
          explanation: "Uncertain fragment.",
          confidence: "medium",
        },
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.withheldCount).toBe(1);
    expect(result.status).toBe("uncertain");
    expect(groundErrorDiagnosis("Yes, please.", { ...raw([]), status: "uncertain" }).status).toBe(
      "uncertain",
    );
  });

  it("deduplicates identical fixes, prioritizes meaning and rejects conflicting overlaps", () => {
    const utterance = "I go yesterday. I have a reserve.";
    const vocabulary = {
      category: "vocabulary",
      original: "reserve",
      corrected: "reservation",
      explanation: "A hotel booking is a reservation.",
      severity: "meaning",
      confidence: "high",
    };
    const result = groundErrorDiagnosis(utterance, raw([tense, tense, vocabulary]));
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.category).toBe("vocabulary");
    expect(result.errors[1]?.category).toBe("tense");
    expect(() =>
      groundErrorDiagnosis(
        "I go yesterday.",
        raw([tense, { ...tense, original: "go yesterday", corrected: "went yesterday" }]),
      ),
    ).toThrow("overlapping");
  });

  it("validates saved diagnosis references, delivery and support exclusion", () => {
    const diagnosis = groundErrorDiagnosis("I go yesterday.", raw([tense]));
    const transcript = [
      { seq: 0, role: "assistant" as const, content: "I go yesterday." },
      { seq: 1, role: "user" as const, content: "I go yesterday." },
      { seq: 3, role: "user" as const, purpose: "support" as const, content: "I go yesterday." },
    ];
    const record = { messageSeq: 1, diagnosis, correctionIndex: 0 };
    expect(() => validateDiagnosisRecords([record], transcript)).not.toThrow();
    expect(() => validateDiagnosisRecords([{ ...record, messageSeq: 0 }], transcript)).toThrow(
      "practice replies",
    );
    expect(() => validateDiagnosisRecords([{ ...record, messageSeq: 3 }], transcript)).toThrow(
      "practice replies",
    );
    expect(() => validateDiagnosisRecords([record, record], transcript)).toThrow("distinct");
    expect(() => validateDiagnosisRecords([{ ...record, correctionIndex: 1 }], transcript)).toThrow(
      "Shown correction",
    );
  });
});

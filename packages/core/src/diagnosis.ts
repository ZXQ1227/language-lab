import { z } from "zod";
import { learnerPracticeText, type EvidenceMessage } from "./assessment";
import { interventionReasonSchema, lightCorrectionReplyIssue } from "./intervention";

const text = z.string().trim().min(1);
const category = z.enum(["grammar", "vocabulary", "collocation", "tense", "article", "spelling"]);
const severity = z.enum(["meaning", "form"]);
const errorText = {
  category,
  original: z
    .string()
    .min(1)
    .max(4000)
    .refine((value) => !!value.trim()),
  corrected: text.max(4000),
  explanation: text.max(600),
};

/** Provider contract keeps legacy four-field errors readable. */
export const diagnosisCandidateSchema = z.object({
  errors: z
    .array(
      z.object({
        ...errorText,
        start: z.number().int().nonnegative().optional(),
        end: z.number().int().positive().optional(),
        severity: severity.optional(),
        confidence: z.enum(["high", "medium", "low"]).optional(),
      }),
    )
    .max(5),
  intent: text.max(160),
  fluency: z.enum(["fluent", "hesitant", "halting", "not_assessed"]).optional(),
  status: z.enum(["checked", "uncertain"]).optional(),
});

export const diagnosedErrorSchema = z.object({
  ...errorText,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  severity,
  confidence: z.literal("high"),
});
export type DiagnosedError = z.infer<typeof diagnosedErrorSchema>;
export const errorDiagnosisSchema = z
  .object({
    errors: z.array(diagnosedErrorSchema).max(5),
    intent: text.max(160),
    fluency: z.literal("not_assessed"),
    source: z.enum(["model", "demo"]),
    status: z.enum(["checked", "uncertain"]),
    withheldCount: z.number().int().min(0).max(5),
  })
  .refine(
    (diagnosis) =>
      diagnosis.errors.length + diagnosis.withheldCount <= 5 &&
      (diagnosis.status === "uncertain" ||
        (diagnosis.withheldCount === 0 && diagnosis.source !== "demo")),
    "Diagnosis status must reflect its source and withheld suggestions",
  );
export type ErrorDiagnosis = z.infer<typeof errorDiagnosisSchema>;
export const errorDiagnosisRecordSchema = z.object({
  messageSeq: z.number().int().nonnegative(),
  diagnosis: errorDiagnosisSchema,
  correctionIndex: z.number().int().min(0).max(4).optional(),
  interventionReason: interventionReasonSchema.optional(),
});
export type ErrorDiagnosisRecord = z.infer<typeof errorDiagnosisRecordSchema>;
export class DiagnosisEvidenceError extends Error {}

const unchanged = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const numbers = (value: string) =>
  value.normalize("NFKC").match(/[-+−]?\p{N}+(?:[.,]\p{N}+)*/gu) ?? [];

function expandEnglishNegation(value: string) {
  return value
    .replace(/[’ʼ]/gu, "'")
    .replace(/\b(?:cannot|can't)\b/gu, "can not")
    .replace(/\bwon't\b/gu, "will not")
    .replace(/\bshan't\b/gu, "shall not")
    .replace(/\b([a-z]+)n't\b/gu, "$1 not");
}

/** A narrow guard for changes to explicit English modal and negation markers. */
export function preservesCorrectionPolarity(
  utterance: string,
  error: Pick<DiagnosedError, "start" | "end" | "corrected">,
  language = "en",
): boolean {
  if (!/^en(?:-|$)/iu.test(language)) return true;
  const original = unchanged(utterance).toLowerCase();
  const suggested = unchanged(
    utterance.slice(0, error.start) + error.corrected + utterance.slice(error.end),
  ).toLowerCase();
  const before = expandEnglishNegation(original);
  const after = expandEnglishNegation(suggested);
  if (original !== suggested && before === after) return false;
  const markers =
    /\b(?:(?:can|could) not(?! only\b)|not only|not|never|no|neither|nor|without|unable)\b/gu;
  return (before.match(markers) ?? []).join(" ") === (after.match(markers) ?? []).join(" ");
}

export function validateDiagnosedErrors(
  utterance: string,
  errors: readonly DiagnosedError[],
): void {
  const ordered = [...errors].sort((a, b) => a.start - b.start);
  for (const [index, error] of ordered.entries()) {
    if (
      error.end <= error.start ||
      error.end > utterance.length ||
      utterance.slice(error.start, error.end) !== error.original
    )
      throw new DiagnosisEvidenceError(
        "Diagnosis must cite exact text in the current learner reply",
      );
    if (unchanged(error.original) === unchanged(error.corrected))
      throw new DiagnosisEvidenceError("Diagnosis correction must change the cited wording");
    if (JSON.stringify(numbers(error.original)) !== JSON.stringify(numbers(error.corrected)))
      throw new DiagnosisEvidenceError("Language corrections must preserve numeric details");
    if (index > 0 && ordered[index - 1]!.end > error.start)
      throw new DiagnosisEvidenceError(
        "Diagnosis contains conflicting or overlapping correction spans",
      );
  }
}

/** Mechanical grounding cannot prove that a model's language judgment is correct. */
export function groundErrorDiagnosis(
  utterance: string,
  raw: unknown,
  source: "model" | "demo" = "model",
  language = "en",
): ErrorDiagnosis {
  const candidate = diagnosisCandidateSchema.parse(raw);
  const errors: DiagnosedError[] = [];
  let withheldCount = 0;
  for (const item of candidate.errors) {
    if (item.confidence && item.confidence !== "high") {
      withheldCount++;
      continue;
    }
    let start = item.start;
    let end = item.end;
    if (start === undefined && end === undefined) {
      start = utterance.indexOf(item.original);
      if (start < 0 || utterance.indexOf(item.original, start + 1) >= 0)
        throw new DiagnosisEvidenceError(
          "Diagnosis quote is absent or ambiguous; supply exact start/end offsets",
        );
      end = start + item.original.length;
    }
    if (start === undefined || end === undefined)
      throw new DiagnosisEvidenceError("Diagnosis needs both start and end offsets");
    const error: DiagnosedError = {
      ...item,
      start,
      end,
      severity: item.severity ?? "form",
      confidence: "high",
    };
    const duplicate = errors.find(
      (previous) =>
        previous.start === error.start &&
        previous.end === error.end &&
        previous.corrected === error.corrected,
    );
    if (duplicate) {
      if (error.severity === "meaning") duplicate.severity = "meaning";
      continue;
    }
    errors.push(error);
  }
  validateDiagnosedErrors(utterance, errors);
  const supported = errors.filter((error) =>
    preservesCorrectionPolarity(utterance, error, language),
  );
  withheldCount += errors.length - supported.length;
  supported.sort(
    (a, b) =>
      Number(b.severity === "meaning") - Number(a.severity === "meaning") || a.start - b.start,
  );
  return errorDiagnosisSchema.parse({
    errors: supported,
    intent: candidate.intent,
    fluency: "not_assessed",
    source,
    status:
      source === "demo" || candidate.status === "uncertain" || withheldCount > 0
        ? "uncertain"
        : "checked",
    withheldCount,
  });
}

export function validateDiagnosisRecords(
  records: readonly ErrorDiagnosisRecord[],
  transcript: readonly EvidenceMessage[],
): void {
  let previousSequence = -1;
  for (const record of records) {
    const message = transcript.find((item) => item.seq === record.messageSeq);
    if (!message || !learnerPracticeText(message) || record.messageSeq <= previousSequence)
      throw new DiagnosisEvidenceError(
        "Diagnosis records must reference distinct learner practice replies in order",
      );
    previousSequence = record.messageSeq;
    validateDiagnosedErrors(message.content, record.diagnosis.errors);
    if (record.diagnosis.errors.some((error) => error.start < (message.practiceStart ?? 0)))
      throw new DiagnosisEvidenceError("Diagnosis evidence cannot cite a help request");
    if (record.correctionIndex !== undefined && !record.diagnosis.errors[record.correctionIndex])
      throw new DiagnosisEvidenceError("Shown correction must reference a diagnosed error");
    if (record.interventionReason !== undefined) {
      if (record.interventionReason === "support_request")
        throw new DiagnosisEvidenceError("Support controls cannot create diagnosis records");
      if (
        (record.interventionReason === "correct_error") !==
        (record.correctionIndex !== undefined)
      )
        throw new DiagnosisEvidenceError("Intervention reason must match correction delivery");
      if (record.correctionIndex !== undefined) {
        const reply = transcript.find((item) => item.seq === record.messageSeq + 1);
        if (
          !reply ||
          reply.role !== "assistant" ||
          lightCorrectionReplyIssue(reply.content, record.diagnosis.errors[record.correctionIndex]!)
        )
          throw new DiagnosisEvidenceError(
            "Saved partner reply must include the approved brief correction",
          );
      }
    }
  }
}

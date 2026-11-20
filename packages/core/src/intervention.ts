import { z } from "zod";
import type { DiagnosedError, ErrorDiagnosisRecord } from "./diagnosis";
import { learnerPracticeText, type EvidenceMessage } from "./assessment";
import type { TeachingPolicy } from "./scenario";
import { trackVocabulary } from "./vocabulary";

export const interventionReasonSchema = z.enum([
  "objectives_complete",
  "corrections_off",
  "budget_exhausted",
  "no_errors",
  "correction_spacing",
  "recently_corrected",
  "not_lightweight",
  "correct_error",
  "fluency_hint",
  "support_request",
]);
export type InterventionReason = z.infer<typeof interventionReasonSchema>;
export const interventionStateSchema = z
  .object({
    version: z.literal(1),
    practiceTurns: z.number().int().nonnegative(),
    corrections: z
      .array(
        z.object({ practiceTurn: z.number().int().positive(), key: z.string().min(1).max(2048) }),
      )
      .max(20),
  })
  .superRefine((state, ctx) => {
    let previous = 0;
    for (const correction of state.corrections) {
      if (correction.practiceTurn <= previous || correction.practiceTurn > state.practiceTurns)
        ctx.addIssue({
          code: "custom",
          message: "Correction history must reference ordered completed practice turns",
        });
      previous = correction.practiceTurn;
    }
  });
export type InterventionState = z.infer<typeof interventionStateSchema>;
const normalized = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/[’ʼ]/gu, "'").replace(/\s+/gu, " ").trim();
export function isLightCorrection(error: Pick<DiagnosedError, "original" | "corrected">): boolean {
  return (
    error.original.length <= 160 &&
    error.corrected.length <= 160 &&
    normalized(error.original).length <= 160 &&
    normalized(error.corrected).length <= 160
  );
}
export const correctionKey = (error: Pick<DiagnosedError, "original" | "corrected">) =>
  JSON.stringify([normalized(error.original), normalized(error.corrected)]);

export function advanceInterventionState(
  state: InterventionState,
  correction?: DiagnosedError,
): InterventionState {
  const practiceTurns = state.practiceTurns + 1;
  return interventionStateSchema.parse({
    version: 1,
    practiceTurns,
    corrections: [
      ...state.corrections,
      ...(correction ? [{ practiceTurn: practiceTurns, key: correctionKey(correction) }] : []),
    ].slice(-20),
  });
}

/** Reconstruct only recorded deliveries; help exchanges never advance spacing. */
export function deriveInterventionState(
  transcript: readonly EvidenceMessage[],
  records: readonly ErrorDiagnosisRecord[],
): InterventionState {
  const steps = new Map<number, number>();
  for (const message of transcript)
    if (learnerPracticeText(message)) steps.set(message.seq, steps.size + 1);
  const corrections = records
    .flatMap((record) => {
      const error =
        record.correctionIndex === undefined
          ? undefined
          : record.diagnosis.errors[record.correctionIndex];
      const practiceTurn = steps.get(record.messageSeq);
      return error && practiceTurn !== undefined
        ? [
            {
              practiceTurn,
              key: isLightCorrection(error)
                ? correctionKey(error)
                : JSON.stringify(["legacy-long-correction", record.messageSeq]),
            },
          ]
        : [];
    })
    .slice(-20);
  return interventionStateSchema.parse({ version: 1, practiceTurns: steps.size, corrections });
}

export function lightCorrectionReplyIssue(
  reply: string,
  correction: DiagnosedError,
): string | undefined {
  if (!isLightCorrection(correction))
    return "The approved correction is too long for an in-conversation recast";
  if (reply.length > 600) return "The partner's correction reply must stay within 600 characters";
  if (!trackVocabulary(reply, [correction.corrected]).used.length)
    return "The partner reply omitted the approved corrected wording";
  return undefined;
}

export interface InterventionDecision {
  action: "continue_conversation" | "light_correction" | "provide_hint" | "complete_task";
  reason: InterventionReason;
  rationale: string;
  correction?: DiagnosedError;
}

/** The model diagnoses language; the teacher's timing and selection are rules. */
export function decideTeachingIntervention(input: {
  errors: readonly DiagnosedError[];
  fluency: "fluent" | "hesitant" | "halting" | "not_assessed";
  hintsGiven: number;
  correctionsGiven: number;
  allObjectivesCompleted: boolean;
  objectiveCount: number;
  policy?: TeachingPolicy;
  history?: InterventionState;
}): InterventionDecision {
  const keepGoing = (reason: InterventionReason, rationale: string): InterventionDecision => ({
    action: "continue_conversation",
    reason,
    rationale,
  });
  if (input.allObjectivesCompleted && input.objectiveCount > 0)
    return {
      action: "complete_task",
      reason: "objectives_complete",
      rationale:
        "Verified lesson objectives are complete; close the scene without another correction.",
    };
  if (input.policy?.correctionMode === "off")
    return keepGoing("corrections_off", "Live corrections are turned off for this course.");
  const maximum = input.policy?.maxCorrections ?? 3;
  if (input.errors.length && input.correctionsGiven >= maximum)
    return keepGoing(
      "budget_exhausted",
      "The lesson correction budget is exhausted; continue the scene.",
    );
  if (!input.errors.length) {
    if (input.fluency === "halting" && input.hintsGiven < (input.policy?.maxHints ?? 3))
      return {
        action: "provide_hint",
        reason: "fluency_hint",
        rationale:
          "Explicit legacy fluency input requests scaffolding; text diagnosis never supplies this signal.",
      };
    return keepGoing("no_errors", "No validated correction is needed.");
  }
  const history = input.history ?? { version: 1, practiceTurns: 0, corrections: [] };
  const currentTurn = history.practiceTurns + 1;
  const spacing = input.policy?.correctionCooldownTurns ?? 1;
  const repeatSpacing = Math.max(spacing, input.policy?.repeatCorrectionCooldownTurns ?? 4);
  const last = history.corrections.at(-1);
  if (last && currentTurn - last.practiceTurn <= spacing)
    return keepGoing(
      "correction_spacing",
      "Leave a practice turn for conversation instead of correcting consecutive replies.",
    );
  const candidates = [...input.errors]
    .sort(
      (a, b) =>
        Number(b.severity === "meaning") - Number(a.severity === "meaning") || a.start - b.start,
    )
    .filter(isLightCorrection);
  if (!candidates.length)
    return keepGoing(
      "not_lightweight",
      "The suggested rewrite is too long for a light correction; keep it in the diagnosis record.",
    );
  const correction = candidates.find(
    (error) =>
      !history.corrections.some(
        (previous) =>
          previous.key === correctionKey(error) &&
          currentTurn - previous.practiceTurn <= repeatSpacing,
      ),
  );
  if (!correction)
    return keepGoing(
      "recently_corrected",
      "The same wording was recently corrected; allow practice instead of repeating the reminder.",
    );
  return {
    action: "light_correction",
    reason: "correct_error",
    rationale: "Give one short, validated recast, then respond to the learner's intended meaning.",
    correction,
  };
}

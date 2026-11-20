import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
const partnerSeq = z.number().int().nonnegative().multipleOf(2);

export const speakingHintSchema = z.strictObject({
  intent: text(300),
  example: text(400),
});
export const speakingTaskSchema = z.strictObject({
  situation: text(500),
  criterion: text(300),
  example: text(400),
});
export const speakingAssessmentSchema = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("met"), quote: text(4000) }),
  z.strictObject({ result: z.literal("retry") }),
  z.strictObject({ result: z.literal("uncertain") }),
]);
export type SpeakingHint = z.infer<typeof speakingHintSchema>;
export type SpeakingTask = z.infer<typeof speakingTaskSchema>;
export type SpeakingAssessment = z.infer<typeof speakingAssessmentSchema>;

const attempt = z.strictObject({
  id: z.uuid(),
  reply: text(4000),
  assessment: speakingAssessmentSchema,
  assisted: z.boolean(),
  at: time,
});
const transfer = z.strictObject({
  id: z.uuid(),
  task: speakingTaskSchema,
  source: z.enum(["authored", "ai"]),
  exampleShownAt: time.optional(),
  attempts: z.array(attempt).max(10),
  skippedAt: time.optional(),
});
const hintRecord = speakingHintSchema.extend({
  anchorSeq: partnerSeq,
  stageId: text(120).optional(),
  source: z.enum(["authored", "ai"]),
  authoredId: text(120).optional(),
  shownAt: time,
  answer: z
    .strictObject({
      messageSeq: z.number().int().positive(),
      assessment: speakingAssessmentSchema,
      at: time,
    })
    .optional(),
  transfer: transfer.optional(),
});

export const speakingPracticeSchema = z.strictObject({
  version: z.literal(1),
  hints: z.array(hintRecord),
});

export type SpeakingPractice = z.infer<typeof speakingPracticeSchema>;
export type SpeakingHintRecord = z.infer<typeof hintRecord>;
export type SpeakingTransfer = z.infer<typeof transfer>;

export function validateSpeakingPractice(
  practice: SpeakingPractice | undefined,
  latestPartnerSeq: number,
  learnerText: (seq: number) => string | undefined,
  stageIds?: ReadonlySet<string>,
) {
  let previous = -1;
  for (const hint of practice?.hints ?? []) {
    if (
      hint.anchorSeq <= previous ||
      hint.anchorSeq > latestPartnerSeq ||
      (stageIds ? !hint.stageId || !stageIds.has(hint.stageId) : !!hint.stageId) ||
      (hint.authoredId && hint.source !== "authored")
    )
      return false;
    previous = hint.anchorSeq;
    const answer = hint.answer;
    if (answer) {
      const reply = learnerText(answer.messageSeq);
      if (
        answer.messageSeq !== hint.anchorSeq + 1 ||
        !reply ||
        answer.at < hint.shownAt ||
        (answer.assessment.result === "met" && !reply.includes(answer.assessment.quote))
      )
        return false;
    }
    const item = hint.transfer;
    if (
      item &&
      (answer?.assessment.result !== "met" ||
        new Set(item.attempts.map((entry) => entry.id)).size !== item.attempts.length ||
        item.attempts.some(
          (entry) =>
            (entry.assessment.result === "met" && !entry.reply.includes(entry.assessment.quote)) ||
            entry.assisted !==
              (item.exampleShownAt !== undefined && item.exampleShownAt <= entry.at),
        ))
    )
      return false;
  }
  return true;
}

export function replaceSpeakingHint(
  practice: SpeakingPractice | undefined,
  hint: SpeakingHintRecord,
): SpeakingPractice {
  const hints = (practice?.hints ?? []).filter((entry) => entry.anchorSeq !== hint.anchorSeq);
  return { version: 1, hints: [...hints, hint].sort((a, b) => a.anchorSeq - b.anchorSeq) };
}

export function latestSpeakingHint(practice: SpeakingPractice | undefined, anchorSeq: number) {
  return practice?.hints.find((entry) => entry.anchorSeq === anchorSeq);
}

export function successfulTransfer(item: SpeakingTransfer | undefined) {
  return item?.attempts.some((entry) => entry.assessment.result === "met") ?? false;
}

export function speakingMemory(practice: SpeakingPractice | undefined, category?: string) {
  if (!practice?.hints.length) return undefined;
  return {
    version: 1 as const,
    ...(category ? { category } : {}),
    expressions: practice.hints.flatMap((hint) =>
      hint.answer?.assessment.result === "met"
        ? [
            {
              anchorSeq: hint.anchorSeq,
              answeredAt: hint.answer.at,
              authored: !!hint.authoredId,
              status:
                hint.transfer?.skippedAt !== undefined
                  ? ("skipped" as const)
                  : successfulTransfer(hint.transfer)
                    ? hint.transfer!.attempts.find((entry) => entry.assessment.result === "met")!
                        .assisted
                      ? ("assisted" as const)
                      : ("independent" as const)
                    : ("ready" as const),
            },
          ]
        : [],
    ),
  };
}

export function sameSpeakingTransferVersion(
  actual: SpeakingTransfer | undefined,
  expected: SpeakingTransfer | undefined,
) {
  return (
    actual?.id === expected?.id &&
    actual?.exampleShownAt === expected?.exampleShownAt &&
    actual?.skippedAt === expected?.skippedAt &&
    actual?.attempts.length === expected?.attempts.length &&
    actual?.attempts.at(-1)?.id === expected?.attempts.at(-1)?.id
  );
}

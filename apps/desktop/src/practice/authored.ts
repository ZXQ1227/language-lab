import { getCurrentCourseStage, trackVocabulary } from "@language-lab/core";
import { z } from "zod";
import hotel from "../../../../content/speaking-practice/hotel-checkin.json";
import type { TrainingSession } from "../training/session";
import {
  speakingHintSchema,
  speakingTaskSchema,
  type SpeakingAssessment,
  type SpeakingHintRecord,
  type SpeakingHint,
} from "./records";

const terms = z.array(z.array(z.string().trim().min(1)).min(1)).min(1);
const exercises = z
  .array(
    z.strictObject({
      id: z.string().min(1),
      stageId: z.string().min(1),
      draftCues: z.array(z.string().min(1)).optional(),
      hint: speakingHintSchema,
      transfer: speakingTaskSchema,
      initialTerms: terms,
      reply: z.string().max(800).optional(),
      transferTerms: terms,
    }),
  )
  .parse(hotel);

export function authoredSpeakingExercise(id: string | undefined) {
  return exercises.find((exercise) => exercise.id === id);
}

export function courseSpeakingHint(
  session: TrainingSession,
  draft: string,
  guidedExample?: string,
): (SpeakingHint & { authoredId?: string }) | undefined {
  const stage = getCurrentCourseStage(session.state);
  if (!stage) return undefined;
  const exercise =
    session.scenario.slug === "hotel-checkin"
      ? exercises.find(
          (item) =>
            item.stageId === stage.id &&
            (item.id !== "hotel-reservation" ||
              !session.scenario.courseTemplate?.selectedVariationId) &&
            (item.draftCues?.some((cue) => draft.toLowerCase().includes(cue)) ?? !draft.trim()),
        )
      : undefined;
  if (exercise) return { ...exercise.hint, authoredId: exercise.id };
  return guidedExample
    ? {
        intent: stage.successCriteria.join(" ").slice(0, 300),
        example: guidedExample.slice(0, 400),
      }
    : undefined;
}

export function checkAuthoredSpeaking(
  hint: SpeakingHintRecord,
  reply: string,
  transfer = false,
): SpeakingAssessment {
  const exercise = authoredSpeakingExercise(hint.authoredId);
  const required = transfer ? exercise?.transferTerms : exercise?.initialTerms;
  // Ambiguous wording falls through to an unverified result in offline practice.
  if (/\b(?:not|never|no|cannot|won['’]t|can['’]t|don['’]t)\b/i.test(reply))
    return { result: "uncertain" };
  if (/\b(?:until|till)\s+4:(?!00\b)/i.test(reply)) return { result: "uncertain" };
  if (required?.every((alternatives) => trackVocabulary(reply, alternatives).used.length))
    return { result: "met", quote: reply };
  if (!transfer && !required && reply.trim() === hint.example)
    return { result: "met", quote: reply };
  return { result: "uncertain" };
}

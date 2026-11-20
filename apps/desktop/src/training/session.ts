import { z } from "zod";
import { TeachingOrchestrator } from "@language-lab/agent-runtime";
import {
  evidenceMessageSchema,
  learnerPracticeText,
  getCurrentCourseStage,
  lessonStateSchema,
  scenarioContentSchema,
  stageAssessmentSchema,
  teachingActionSchema,
  validateStageAssessment,
  resolveCourseTemplate,
  type ScenarioContent,
  type DialogueSupport,
  detectDialogueSupport,
  dialogueMoveSchema,
  dialogueSupportSchema,
  turnEvidenceStatusSchema,
  validateDialogueMemory,
  summarizeVocabulary,
  vocabularyCounts,
  type LessonState,
  type EvidenceMessage,
  errorDiagnosisRecordSchema,
  validateDiagnosisRecords,
  deriveInterventionState,
  buildLearningReport,
  learningReportSchema,
  reviewPlanSchema,
  validateReviewPlan,
  recordReviewAttempt,
  type ReviewAttempt,
  speechInputSchema,
  type SpeechInput,
} from "@language-lab/core";
import {
  createDefaultSkillRegistry,
  createMockSkillRegistry,
  createMockObjectiveEvaluatorSkill,
  createMockDialogueRoleplaySkill,
  lessonEvaluationSchema,
  SkillRegistry,
} from "@language-lab/skills";
import { createMockGateway, type ModelGateway } from "@language-lab/model-gateway";
import {
  defaultProfileMemory,
  lessonMemoryContributionSchema,
  projectLearningMemory,
  selectLearningMemory,
  type MemorySnapshot,
} from "@language-lab/memory";
import { buildLearningContribution } from "./learningMemory";
import { loadScenarioContent } from "../content/scenarioContent";

import { trainingProviderSchema, type TrainingProvider } from "./provider";

export { trainingProviderSchema, type TrainingProvider } from "./provider";

export const trainingSessionSchema = z
  .object({
    version: z.literal(1),
    vocabularyTrackingVersion: z.literal(1).optional(),
    diagnoses: z.array(errorDiagnosisRecordSchema).max(100).optional(),
    learningMemory: lessonMemoryContributionSchema.optional(),
    id: z.string().min(1),
    scenario: scenarioContentSchema,
    provider: trainingProviderSchema,
    state: lessonStateSchema,
    messages: z.array(evidenceMessageSchema).min(1).max(201),
    events: z.array(
      z.object({ type: z.string(), payload: z.record(z.string(), z.unknown()).optional() }),
    ),
    endedEarly: z.literal(true).optional(),
    travelTransfer: z
      .strictObject({
        sourceLessonId: z.string().min(1),
        completedAt: z.number().int().nonnegative().optional(),
      })
      .optional(),
    lastTurn: z
      .object({
        action: teachingActionSchema,
        errors: z.array(
          z.object({ original: z.string(), corrected: z.string(), explanation: z.string() }),
        ),
        assessment: stageAssessmentSchema.optional(),
        supportRequest: dialogueSupportSchema.optional(),
        evidenceStatus: turnEvidenceStatusSchema.optional(),
        move: dialogueMoveSchema.optional(),
      })
      .optional(),
    report: lessonEvaluationSchema.optional(),
    learningReport: learningReportSchema.optional(),
    reviewPlan: reviewPlanSchema.optional(),
    reportReflection: z
      .object({ note: z.string().trim().max(2000), nextPractice: z.string().trim().max(500) })
      .optional(),
    reviewAnswers: z.record(z.string(), z.string().max(2000)).optional(),
  })
  .superRefine((session, ctx) => {
    if (session.travelTransfer) {
      const { sourceLessonId, completedAt } = session.travelTransfer;
      const complete = session.state.phase === "debrief" || session.state.phase === "done";
      if (
        sourceLessonId === session.id ||
        session.scenario.slug !== "hotel-checkin" ||
        session.provider.mode !== "ai" ||
        !session.scenario.courseTemplate?.selectedVariationId ||
        complete !== (completedAt !== undefined) ||
        (completedAt !== undefined && completedAt > session.state.updatedAt)
      )
        ctx.addIssue({
          code: "custom",
          path: ["travelTransfer"],
          message: "Invalid travel transfer evidence",
        });
    }
    if (
      session.messages.some(
        (message) =>
          message.speech &&
          message.speech.language.toLowerCase() !==
            session.state.courseTemplate?.targetLanguage.toLowerCase(),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Speech input language must match the saved course",
      });
    if (session.reviewPlan) {
      try {
        validateReviewPlan(session.reviewPlan, session);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["reviewPlan"],
          message: "Review targets and progress must match saved lesson evidence",
        });
      }
    }
    if (session.learningReport) {
      try {
        if (
          JSON.stringify(session.learningReport) !==
          JSON.stringify(buildLearningReport(session, session.learningReport))
        )
          throw new Error("Report does not match saved evidence");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["learningReport"],
          message: "Learning report must match saved lesson evidence",
        });
      }
    }
    if (session.reportReflection && session.state.phase !== "done")
      ctx.addIssue({
        code: "custom",
        path: ["reportReflection"],
        message: "Complete the lesson before saving a reflection",
      });
    if (session.learningMemory) {
      try {
        if (
          JSON.stringify(session.learningMemory) !==
          JSON.stringify(buildLearningContribution(session))
        )
          throw new Error("Unverified memory projection");
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["learningMemory"],
          message: "Learning memory must match saved learner practice and diagnosis evidence",
        });
      }
    }
    try {
      validateDiagnosisRecords(session.diagnoses ?? [], session.messages);
      if (
        session.state.interventionState &&
        JSON.stringify(session.state.interventionState) !==
          JSON.stringify(deriveInterventionState(session.messages, session.diagnoses ?? []))
      )
        throw new Error("Intervention state does not match practice evidence");
      const shown = (session.diagnoses ?? []).filter(
        (record) => record.correctionIndex !== undefined,
      ).length;
      const policy = session.state.courseTemplate?.teachingPolicy;
      if (
        shown > session.state.correctionsGiven ||
        (policy &&
          (shown > policy.maxCorrections || (policy.correctionMode === "off" && shown > 0)))
      )
        throw new Error("Invalid delivered correction count");
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["diagnoses"],
        message: "Saved language feedback has invalid learner evidence or correction delivery",
      });
    }
    if (session.vocabularyTrackingVersion === 1) {
      const counts = trainingVocabularyCounts(session.state, session.messages);
      if (
        Object.keys(counts).length !== Object.keys(session.state.vocabularySeen).length ||
        Object.entries(counts).some(([key, count]) => session.state.vocabularySeen[key] !== count)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["state", "vocabularySeen"],
          message: "Saved vocabulary counts do not match learner practice evidence",
        });
      }
    }
    if (
      session.id !== session.state.lessonId ||
      session.scenario.id !== session.state.scenarioId ||
      !session.state.courseTemplate ||
      session.messages.some(
        (message, index) =>
          message.seq !== index || message.role !== (index % 2 === 0 ? "assistant" : "user"),
      ) ||
      session.messages.length !== session.state.turnCount * 2 + 1 ||
      (session.endedEarly &&
        session.state.phase !== "briefing" &&
        session.state.phase !== "practice") ||
      (session.state.phase === "done") !== !!session.report
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Training checkpoint has inconsistent state or transcript",
      });
    }
    try {
      validateDialogueMemory(session.state.dialogueMemory ?? [], session.messages);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["state", "dialogueMemory"],
        message: "Saved dialogue memory has invalid learner citations",
      });
    }
    if (
      JSON.stringify(resolveCourseTemplate(session.scenario)) !==
        JSON.stringify(session.state.courseTemplate) ||
      session.scenario.difficulty !== session.state.difficulty ||
      JSON.stringify(session.scenario.targetVocabulary) !==
        JSON.stringify(session.state.targetVocabulary) ||
      session.state.objectives.length !== session.scenario.objectives.length ||
      session.state.objectives.some(
        (objective, index) =>
          objective.id !== `obj-${index + 1}` ||
          objective.description !== session.scenario.objectives[index],
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Training course snapshot does not match its source",
      });
    }
    for (const stage of session.state.courseTemplate?.stages ?? []) {
      const assessment = session.state.stageAssessments?.[stage.id];
      if (assessment) {
        try {
          validateStageAssessment(assessment, stage, session.messages);
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["state", "stageAssessments", stage.id],
            message: "Saved assessment contains invalid learner citations",
          });
        }
      }
      if (
        session.state.objectives.some(
          (objective) => stage.objectiveIds.includes(objective.id) && objective.completed,
        ) &&
        !assessment?.criteria.every((criterion) => criterion.met)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Completed objectives need verified stage evidence",
        });
      }
    }
    if (
      session.reviewAnswers &&
      (session.state.phase !== "done" ||
        !session.state.courseTemplate?.learningPack ||
        Object.keys(session.reviewAnswers).some(
          (id) =>
            !session.state.courseTemplate!.learningPack!.reviewPractice.some(
              (item) => item.id === id,
            ),
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewAnswers"],
        message: "Review answers must belong to a completed course pack",
      });
    }
  });
export type TrainingSession = z.infer<typeof trainingSessionSchema>;
export const trainingTurnLimit = 100;

export function isTrainingUnfinished(session: TrainingSession): boolean {
  return (
    (session.state.phase === "briefing" || session.state.phase === "practice") &&
    (session.endedEarly === true || session.state.turnCount >= trainingTurnLimit)
  );
}

export function endTrainingEarly(session: TrainingSession): TrainingSession {
  if (session.state.phase !== "briefing" && session.state.phase !== "practice")
    throw new Error("Only active practice can be ended early");
  return finalizeCheckpoint({
    ...session,
    endedEarly: true,
    state: { ...session.state, updatedAt: Date.now() },
  });
}

function finalizeCheckpoint(raw: Record<string, unknown>): TrainingSession {
  const session = trainingSessionSchema.parse({ ...raw, learningMemory: undefined });
  return { ...session, learningMemory: buildLearningContribution(session) };
}

function trainingVocabularyCounts(state: LessonState, messages: readonly EvidenceMessage[]) {
  return vocabularyCounts(
    summarizeVocabulary(
      state.targetVocabulary,
      messages,
      state.courseTemplate?.learningPack?.vocabulary.map((item) => ({
        term: item.term,
        forms: item.forms ?? [],
      })),
    ),
  );
}

const DEMO: Record<string, Record<string, { answer: string; prompt: string }>> = {
  "cafe-order": {
    "place-order": {
      answer: "Could I have a latte and a muffin, please?",
      prompt: "Good morning! What drink and snack would you like?",
    },
    "choose-options": {
      answer: "Do you have oat milk? I would like a regular latte with oat milk, please.",
      prompt: "What size would you like? We have dairy and oat milk.",
    },
    "confirm-order": {
      answer:
        "To go, please. Yes, a regular oat milk latte and a muffin. That is right, thank you.",
      prompt: "Is that for here or to go? A regular oat milk latte and a muffin, is that right?",
    },
  },
  "doctor-visit": {
    "describe-symptoms": {
      answer: "I have a sore throat and a fever.",
      prompt: "What symptoms do you have?",
    },
    "explain-timeline": {
      answer: "It started two days ago and it is worse today.",
      prompt: "When did it start, and has it changed?",
    },
    "check-understanding": {
      answer:
        "I need to take the prescription to the pharmacy and ask the pharmacist to explain the instructions.",
      prompt:
        "For this roleplay, take this fictional prescription to the pharmacy and ask the pharmacist to explain the instructions. What will you do next?",
    },
  },
  "small-talk": {
    "open-conversation": {
      answer: "Morning! How was your weekend?",
      prompt: "Morning! Good to see you.",
    },
    "exchange-weekend-news": {
      answer: "Who did you go hiking with? I visited my family at the weekend. That sounds fun!",
      prompt: "I went hiking over the weekend. How about your weekend?",
    },
    "close-politely": {
      answer: "Anyway, I need to get to my meeting. Catch up later!",
      prompt: "Our next meeting starts soon.",
    },
  },
};

const bundledCourses = loadScenarioContent();

function guidedMaterial(scenario: ScenarioContent, stageId: string) {
  const authored = resolveCourseTemplate(scenario)?.learningPack?.guidedPractice.find(
    (item) => item.stageId === stageId,
  );
  return authored
    ? { answer: authored.suggestedReply, prompt: authored.partnerPrompt }
    : DEMO[scenario.slug]?.[stageId];
}

export function supportsGuidedDemo(scenario: ScenarioContent): boolean {
  const original = bundledCourses.find((item) => item.slug === scenario.slug);
  const material = (item: ScenarioContent) => ({
    objectives: item.objectives,
    vocabulary: item.targetVocabulary,
    setting: item.courseTemplate?.setting,
    roles: item.courseTemplate?.roles,
    patterns: item.courseTemplate?.targetPatterns,
    openingLine: item.courseTemplate?.openingLine,
    stages: item.courseTemplate?.stages,
    language: item.courseTemplate?.targetLanguage,
    learningPack: item.courseTemplate?.learningPack,
    character: item.courseTemplate?.character,
  });
  return (
    !!original &&
    (!!DEMO[scenario.slug] || !!original.courseTemplate?.learningPack) &&
    JSON.stringify(material(original)) === JSON.stringify(material(scenario))
  );
}

export function getGuidedExample(session: TrainingSession): string | undefined {
  const stage = getCurrentCourseStage(session.state);
  return stage && session.provider.mode === "demo"
    ? guidedMaterial(session.scenario, stage.id)?.answer
    : undefined;
}

function makeSkills(scenario: ScenarioContent, demo: boolean) {
  if (!demo) return createDefaultSkillRegistry();
  const registry = new SkillRegistry();
  for (const skill of createMockSkillRegistry().list()) {
    if (skill.id !== "skills.objective_evaluator" && skill.id !== "skills.dialogue_roleplay")
      registry.register(skill);
  }
  registry.register(
    createMockObjectiveEvaluatorSkill((input) => {
      const message = input.transcript.at(-1)!;
      const example = guidedMaterial(scenario, input.stage.id)?.answer;
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const answer = learnerPracticeText(message) ?? "";
      const met = !!example && normalize(answer) === normalize(example);
      return {
        stageId: input.stage.id,
        criteria: input.stage.successCriteria.map((_, criterionIndex) => ({
          criterionIndex,
          met,
          evidence: met ? [{ messageSeq: message.seq, quote: answer }] : [],
        })),
        feedback: met
          ? "Suggested reply demonstrated. Move to the next practice step."
          : "This guided demo checks the suggested reply only. Try the example, or connect AI for free-form assessment.",
      };
    }),
  );
  registry.register({
    ...createMockDialogueRoleplaySkill(),
    async execute(input, context) {
      const stage = getCurrentCourseStage(context.lessonState);
      if (input.supportRequest === "repeat")
        return createMockDialogueRoleplaySkill().execute(input, context);
      if (input.supportRequest === "hint") {
        const hint =
          stage?.hints.find(
            (candidate) =>
              !input.recentMessages.some(
                (message) => message.role === "assistant" && message.content.includes(candidate),
              ),
          ) ?? stage?.hints[0];
        return {
          reply: hint ? `A hint: ${hint}` : "Try one short reply for the current task.",
          tone: "encouraging",
          move: "hint",
          memoryUpdates: [],
        };
      }
      return {
        reply:
          (input.intervention.correction
            ? `You can say: “${input.intervention.correction.corrected}”. `
            : "") +
          (stage
            ? (guidedMaterial(scenario, stage.id)?.prompt ?? "Please try the suggested reply.")
            : "Well done! You completed all practice steps. You can now review the lesson."),
        tone: input.intervention.action === "light_correction" ? "corrective" : "encouraging",
      };
    },
  });
  return registry;
}

/** Each operation runs against a private draft. The caller commits a full checkpoint. */
function runtime(
  scenario: ScenarioContent,
  provider: TrainingProvider,
  gateway: ModelGateway,
  saved?: TrainingSession,
  memory?: MemorySnapshot,
) {
  const snapshot =
    memory ??
    selectLearningMemory(
      projectLearningMemory(
        defaultProfileMemory(),
        saved ? [saved.learningMemory ?? buildLearningContribution(saved)] : [],
      ),
      scenario.courseTemplate!.targetLanguage,
      scenario.targetVocabulary,
    );
  // Old checkpoints are upgraded only in this private draft and committed atomically.
  let state = saved
    ? lessonStateSchema.parse({
        ...saved.state,
        vocabularySeen: trainingVocabularyCounts(saved.state, saved.messages),
        interventionState:
          saved.state.interventionState ??
          deriveInterventionState(saved.messages, saved.diagnoses ?? []),
      })
    : undefined;
  return new TeachingOrchestrator({
    gateway,
    skills: makeSkills(scenario, provider.mode === "demo"),
    stateStore: {
      load: async () => state ?? null,
      save: async (value) => {
        state = lessonStateSchema.parse(value);
      },
    },
    profile: {
      profile: async () => ({
        userId: "local-training-user",
        targetLanguage: snapshot.profile.targetLanguage,
        level: snapshot.profile.level,
        goals: snapshot.profile.goals,
      }),
    },
    memory: {
      snapshot: async () => snapshot,
    },
    data: {
      findScenario: async (id) => (id === scenario.id ? scenario : null),
      recentMessages: async (_, limit) => saved?.messages.slice(-limit) ?? [],
      recordLearningEvent: async () => {},
    },
  });
}

export async function createTrainingSession(
  raw: unknown,
  rawProvider: unknown,
  gateway: ModelGateway,
  memory?: MemorySnapshot,
): Promise<TrainingSession> {
  const scenario = scenarioContentSchema.parse(raw);
  const provider = trainingProviderSchema.parse(rawProvider);
  if (!scenario.courseTemplate) throw new Error("Choose a course with authored teaching stages");
  if (provider.mode === "demo" && !supportsGuidedDemo(scenario))
    throw new Error("Connect AI to practise this custom course");
  const id = crypto.randomUUID();
  const { state } = await runtime(scenario, provider, gateway, undefined, memory).initLesson({
    userId: "local-training-user",
    lessonId: id,
    conversationId: id,
    studentLevel: memory?.profile.level ?? scenario.difficulty,
    studentGoals: memory?.profile.goals ?? [],
    scenarioCandidates: [scenario],
  });
  return finalizeCheckpoint({
    version: 1,
    vocabularyTrackingVersion: 1,
    id,
    scenario,
    provider,
    state,
    messages: [{ seq: 0, role: "assistant", content: state.courseTemplate!.openingLine }],
    events: [],
    diagnoses: [],
  });
}

export async function runTrainingTurn(
  session: TrainingSession,
  utterance: string,
  gateway: ModelGateway,
  supportRequest?: DialogueSupport,
  memory?: MemorySnapshot,
  speech?: SpeechInput,
): Promise<TrainingSession> {
  if (speech) speech = speechInputSchema.parse(speech);
  supportRequest = supportRequest ?? detectDialogueSupport(utterance);
  if (supportRequest === "simplify" && session.provider.mode === "demo")
    throw new Error("Connect AI to request simpler English");
  if (session.state.turnCount >= trainingTurnLimit)
    throw new Error("This lesson has reached its 100-turn limit. Start a new practice session.");
  if (session.endedEarly) throw new Error("This practice has already ended");
  const agent = runtime(session.scenario, session.provider, gateway, session, memory);
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new DOMException("The practice turn timed out", "TimeoutError")),
    50_000,
  );
  const result = await agent
    .processStudentTurn({
      userId: "local-training-user",
      lessonId: session.id,
      conversationId: session.id,
      utterance: utterance.trim(),
      mode: speech ? "voice" : "text",
      confidence: speech?.confidence,
      supportRequest,
      signal: controller.signal,
    })
    .finally(() => clearTimeout(deadline));
  controller.signal.throwIfAborted();

  return finalizeCheckpoint({
    ...session,
    vocabularyTrackingVersion: 1,
    state: result.state,
    ...(session.travelTransfer && result.state.phase === "debrief"
      ? {
          travelTransfer: { ...session.travelTransfer, completedAt: result.state.updatedAt },
        }
      : {}),
    messages: [
      ...session.messages,
      {
        seq: session.messages.length,
        role: "user",
        content: utterance.trim(),
        ...(speech ? { speech } : {}),
        ...(result.supportRequest
          ? { purpose: "support" as const }
          : result.evidenceStatus
            ? { purpose: "non_practice" as const }
            : result.practiceStart !== undefined
              ? { practiceStart: result.practiceStart }
              : {}),
      },
      {
        seq: session.messages.length + 1,
        role: "assistant",
        content: result.reply,
        ...(result.supportRequest
          ? { purpose: "support" as const }
          : result.evidenceStatus
            ? { purpose: "non_practice" as const }
            : {}),
      },
    ],
    events: [...session.events, ...result.persistedEvents],
    diagnoses: result.analysis.diagnosis
      ? [
          ...(session.diagnoses ?? []),
          {
            messageSeq: session.messages.length,
            diagnosis: result.analysis.diagnosis,
            interventionReason: result.interventionReason,
            ...(result.correction
              ? {
                  correctionIndex: result.analysis.diagnosis.errors.findIndex(
                    (error) =>
                      error.start === result.correction!.start &&
                      error.end === result.correction!.end,
                  ),
                }
              : {}),
          },
        ]
      : session.diagnoses,
    lastTurn: {
      action: result.teachingAction,
      errors: result.analysis.errors,
      assessment:
        result.assessment ?? (result.supportRequest ? session.lastTurn?.assessment : undefined),
      supportRequest: result.supportRequest,
      evidenceStatus: result.evidenceStatus,
      move: result.dialogueMove,
    },
  });
}

export async function finishTrainingSession(
  session: TrainingSession,
  gateway: ModelGateway,
  memory?: MemorySnapshot,
): Promise<TrainingSession> {
  const result = await runtime(
    session.scenario,
    session.provider,
    gateway,
    session,
    memory,
  ).finishLesson({
    userId: "local-training-user",
    lessonId: session.id,
    conversationId: session.id,
    diagnoses: session.diagnoses,
  });
  return finalizeCheckpoint({
    ...session,
    ...result,
    vocabularyTrackingVersion: 1,
    learningReport: buildLearningReport(
      { ...session, ...result },
      { generatedAt: result.state.updatedAt, provenance: "saved_on_finish" },
    ),
  });
}

export const dialogueSupportText: Record<DialogueSupport, string> = {
  repeat: "Please repeat your last reply.",
  simplify: "Could you say that in simpler English?",
  hint: "Could you give me one hint?",
};

export function saveCourseReview(
  session: TrainingSession,
  answers: Record<string, string>,
): TrainingSession {
  return finalizeCheckpoint({
    ...session,
    reviewAnswers: answers,
    state: { ...session.state, updatedAt: Date.now() },
  });
}

export function saveReportReflection(
  session: TrainingSession,
  reflection: NonNullable<TrainingSession["reportReflection"]>,
): TrainingSession {
  return finalizeCheckpoint({
    ...session,
    reportReflection: reflection,
    state: { ...session.state, updatedAt: Date.now() },
  });
}

export async function generateTrainingReview(session: TrainingSession): Promise<TrainingSession> {
  const source = trainingSessionSchema.parse(session);
  if (source.reviewPlan) return source;
  const reviewPlan = await runtime(
    source.scenario,
    source.provider,
    createMockGateway(),
    source,
  ).generateReview({
    userId: "local-training-user",
    lessonId: source.id,
    conversationId: source.id,
    diagnoses: source.diagnoses,
  });
  return finalizeCheckpoint({ ...source, reviewPlan });
}

export function saveTrainingReviewAttempt(
  session: TrainingSession,
  taskId: string,
  input: { answer: string; exampleRevealed: boolean; rating: ReviewAttempt["rating"] },
  at = Date.now(),
): TrainingSession {
  const source = trainingSessionSchema.parse(session);
  if (!source.reviewPlan) throw new Error("Generate targeted review first");
  return finalizeCheckpoint({
    ...source,
    reviewPlan: recordReviewAttempt(source.reviewPlan, taskId, input, at),
  });
}

import { z } from "zod";
import { TeachingOrchestrator } from "@language-lab/agent-runtime";
import {
  evidenceMessageSchema,
  getCurrentCourseStage,
  lessonStateSchema,
  scenarioContentSchema,
  stageAssessmentSchema,
  teachingActionSchema,
  validateStageAssessment,
  resolveCourseTemplate,
  type ScenarioContent,
} from "@language-lab/core";
import {
  createDefaultSkillRegistry,
  createMockSkillRegistry,
  createMockObjectiveEvaluatorSkill,
  createMockDialogueRoleplaySkill,
  lessonEvaluationSchema,
  SkillRegistry,
} from "@language-lab/skills";
import type { ModelGateway } from "@language-lab/model-gateway";
import { loadScenarioContent } from "../content/scenarioContent";

const endpointSchema = z
  .string()
  .trim()
  .url()
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalEndpoint(value))) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Use an HTTPS endpoint (or localhost HTTP), without credentials, query parameters or fragments",
      });
    }
  })
  .transform((value) => value.replace(/\/+$/, ""));

export const trainingProviderSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("demo") }),
  z.strictObject({
    mode: z.literal("ai"),
    baseUrl: endpointSchema,
    model: z.string().trim().min(1),
  }),
]);
export type TrainingProvider = z.infer<typeof trainingProviderSchema>;

export function isLocalEndpoint(baseUrl: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname);
}

export const trainingSessionSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    scenario: scenarioContentSchema,
    provider: trainingProviderSchema,
    state: lessonStateSchema,
    messages: z.array(evidenceMessageSchema).min(1).max(201),
    events: z.array(
      z.object({ type: z.string(), payload: z.record(z.string(), z.unknown()).optional() }),
    ),
    lastTurn: z
      .object({
        action: teachingActionSchema,
        errors: z.array(
          z.object({ original: z.string(), corrected: z.string(), explanation: z.string() }),
        ),
        assessment: stageAssessmentSchema.optional(),
      })
      .optional(),
    report: lessonEvaluationSchema.optional(),
    reviewAnswers: z.record(z.string(), z.string().max(2000)).optional(),
  })
  .superRefine((session, ctx) => {
    if (
      session.id !== session.state.lessonId ||
      session.scenario.id !== session.state.scenarioId ||
      !session.state.courseTemplate ||
      session.messages.some(
        (message, index) =>
          message.seq !== index || message.role !== (index % 2 === 0 ? "assistant" : "user"),
      ) ||
      session.messages.length !== session.state.turnCount * 2 + 1 ||
      (session.state.phase === "done") !== !!session.report
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Training checkpoint has inconsistent state or transcript",
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
      const met = !!example && normalize(message.content) === normalize(example);
      return {
        stageId: input.stage.id,
        criteria: input.stage.successCriteria.map((_, criterionIndex) => ({
          criterionIndex,
          met,
          evidence: met ? [{ messageSeq: message.seq, quote: message.content }] : [],
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
      return {
        reply: stage
          ? (guidedMaterial(scenario, stage.id)?.prompt ?? "Please try the suggested reply.")
          : "Well done! You completed all practice steps. You can now review the lesson.",
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
) {
  let state = saved ? lessonStateSchema.parse(saved.state) : undefined;
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
        targetLanguage: scenario.courseTemplate!.targetLanguage,
        level: scenario.difficulty,
        goals: [...scenario.objectives],
      }),
    },
    memory: {
      snapshot: async () => ({
        profile: {
          targetLanguage: scenario.courseTemplate!.targetLanguage,
          level: scenario.difficulty,
          goals: [...scenario.objectives],
        },
        knowledge: Object.keys(saved?.state.vocabularySeen ?? {}).map((item) => ({
          item,
          mastery: "learning" as const,
        })),
        errors: [],
        episodes: [],
      }),
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
): Promise<TrainingSession> {
  const scenario = scenarioContentSchema.parse(raw);
  const provider = trainingProviderSchema.parse(rawProvider);
  if (!scenario.courseTemplate) throw new Error("Choose a course with authored teaching stages");
  if (provider.mode === "demo" && !supportsGuidedDemo(scenario))
    throw new Error("Connect AI to practise this custom course");
  const id = crypto.randomUUID();
  const { state } = await runtime(scenario, provider, gateway).initLesson({
    userId: "local-training-user",
    lessonId: id,
    conversationId: id,
    studentLevel: scenario.difficulty,
    studentGoals: scenario.objectives,
    scenarioCandidates: [scenario],
  });
  return trainingSessionSchema.parse({
    version: 1,
    id,
    scenario,
    provider,
    state,
    messages: [{ seq: 0, role: "assistant", content: state.courseTemplate!.openingLine }],
    events: [],
  });
}

export async function runTrainingTurn(
  session: TrainingSession,
  utterance: string,
  gateway: ModelGateway,
): Promise<TrainingSession> {
  if (session.state.turnCount >= 100)
    throw new Error("This lesson has reached its 100-turn limit. Start a new practice session.");
  const result = await runtime(
    session.scenario,
    session.provider,
    gateway,
    session,
  ).processStudentTurn({
    userId: "local-training-user",
    lessonId: session.id,
    conversationId: session.id,
    utterance: utterance.trim(),
    mode: "text",
  });
  return trainingSessionSchema.parse({
    ...session,
    state: result.state,
    messages: [
      ...session.messages,
      { seq: session.messages.length, role: "user", content: utterance.trim() },
      { seq: session.messages.length + 1, role: "assistant", content: result.reply },
    ],
    events: [...session.events, ...result.persistedEvents],
    lastTurn: {
      action: result.teachingAction,
      errors: result.analysis.errors,
      assessment: result.assessment,
    },
  });
}

export async function finishTrainingSession(
  session: TrainingSession,
  gateway: ModelGateway,
): Promise<TrainingSession> {
  const result = await runtime(session.scenario, session.provider, gateway, session).finishLesson({
    userId: "local-training-user",
    lessonId: session.id,
    conversationId: session.id,
  });
  return trainingSessionSchema.parse({ ...session, ...result });
}

export function saveCourseReview(
  session: TrainingSession,
  answers: Record<string, string>,
): TrainingSession {
  return trainingSessionSchema.parse({
    ...session,
    reviewAnswers: answers,
    state: { ...session.state, updatedAt: Date.now() },
  });
}

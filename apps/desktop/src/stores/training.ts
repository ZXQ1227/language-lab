import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import {
  scenarioContentSchema,
  dialogueSupportSchema,
  detectDialogueSupport,
  trackVocabulary,
  type DialogueSupport,
  type ScenarioContent,
  type ReviewPlan,
  type ReviewAttempt,
  type SpeechInput,
} from "@language-lab/core";
import { createMockGateway } from "@language-lab/model-gateway";
import {
  defaultProfileMemory,
  projectLearningMemory,
  selectLearningMemory,
  writeLearningProfile,
  type LearningMemoryDocument,
  type LessonMemoryContribution,
  type LearningProfile,
  type MemorySnapshot,
} from "@language-lab/memory";
import { call } from "../lib/ipc";
import {
  createTrainingSession,
  finishTrainingSession,
  endTrainingEarly,
  runTrainingTurn,
  saveCourseReview,
  saveReportReflection,
  generateTrainingReview,
  saveTrainingReviewAttempt,
  dialogueSupportText,
  trainingProviderSchema,
  trainingSessionSchema,
  type TrainingProvider,
  type TrainingSession,
} from "../training/session";
import { saveTrainingKey, trainingGateway } from "../training/gateway";
import { buildLearningContribution } from "../training/learningMemory";
import { LOCAL_LEARNER_ID, readLearningMemory } from "../training/learningMemoryPersistence";
import { readReviewPlans } from "../training/reviewPersistence";
import {
  buildFreeConversationContribution,
  freeConversationCheckpointSchema,
  type FreeConversationCheckpoint,
} from "../conversation/checkpoint";

const repositories = () => createRepositories(createTauriTransport(call));

interface TrainingStore {
  sessions: TrainingSession[];
  session: TrainingSession | null;
  reportSession: TrainingSession | null;
  reviewPlans: ReviewPlan[];
  reviewsLoaded: boolean;
  loadReviews: () => Promise<void>;
  generateReview: (lessonId: string) => Promise<boolean>;
  saveReviewAttempt: (
    lessonId: string,
    taskId: string,
    input: { answer: string; exampleRevealed: boolean; rating: ReviewAttempt["rating"] },
  ) => Promise<boolean>;
  loadReport: (id: string) => Promise<boolean>;
  saveReflection: (
    reflection: NonNullable<TrainingSession["reportReflection"]>,
  ) => Promise<boolean>;
  pendingCourse: ScenarioContent | null;
  loaded: boolean;
  busy: boolean;
  turnStatus: "idle" | "responding" | "saving" | "replyFailed" | "saveFailed";
  error: string | null;
  learningMemory: LearningMemoryDocument | null;
  memoryContributions: LessonMemoryContribution[];
  saveProfile: (profile: LearningProfile) => Promise<boolean>;
  openLesson: (id: string) => Promise<boolean>;
  loadFreeConversation: (id: string) => Promise<FreeConversationCheckpoint>;
  saveFreeConversation: (
    checkpoint: FreeConversationCheckpoint,
    signal: AbortSignal,
  ) => Promise<boolean>;
  freeConversationMemory: (utterance: string) => Promise<MemorySnapshot>;
  load: () => Promise<void>;
  prepare: (course?: ScenarioContent) => void;
  resume: (id: string) => void;
  start: (course: ScenarioContent, provider: TrainingProvider, key?: string) => Promise<void>;
  send: (utterance: string, speech?: SpeechInput) => Promise<boolean>;
  requestSupport: (request: DialogueSupport) => Promise<boolean>;
  finish: () => Promise<void>;
  endEarly: () => Promise<boolean>;
  saveReviewAnswers: (answers: Record<string, string>) => Promise<boolean>;
}

export const useTrainingStore = create<TrainingStore>((set, get) => {
  let pendingWrite: { base: TrainingSession; key: string; next: TrainingSession } | undefined;

  async function commit(session: TrainingSession, activate = true) {
    const checkpoint = trainingSessionSchema.parse(session);
    const contribution = checkpoint.learningMemory ?? buildLearningContribution(checkpoint);
    const contributions = [
      ...get().memoryContributions.filter((item) => item.lessonId !== checkpoint.id),
      contribution,
    ];
    const previousMemory = get().learningMemory;
    const learningMemory = projectLearningMemory(
      previousMemory?.profile ?? defaultProfileMemory(),
      contributions,
      previousMemory?.profileSaved ?? false,
    );
    await repositories().learningEvents.saveTrainingCheckpoint({
      id: checkpoint.id,
      payload: checkpoint,
      memory: contribution,
      reviewPlan: checkpoint.reviewPlan,
    });
    set({
      ...(activate
        ? { session: checkpoint, pendingCourse: null }
        : get().session?.id === checkpoint.id
          ? { session: checkpoint }
          : {}),
      ...(get().reportSession?.id === checkpoint.id ? { reportSession: checkpoint } : {}),
      memoryContributions: contributions,
      learningMemory,
      ...(checkpoint.reviewPlan
        ? {
            reviewPlans: [
              checkpoint.reviewPlan,
              ...get().reviewPlans.filter((p) => p.lessonId !== checkpoint.id),
            ],
          }
        : {}),
      sessions: [checkpoint, ...get().sessions.filter((item) => item.id !== checkpoint.id)].slice(
        0,
        50,
      ),
    });
  }
  async function snapshot(course: ScenarioContent) {
    if (!get().learningMemory) {
      const loaded = await readLearningMemory(repositories());
      set({ learningMemory: loaded.document, memoryContributions: loaded.contributions });
    }
    return selectLearningMemory(
      get().learningMemory!,
      course.courseTemplate!.targetLanguage,
      course.targetVocabulary,
    );
  }
  async function operation(work: () => Promise<void>): Promise<boolean> {
    if (get().busy) return false;
    set({ busy: true, error: null, turnStatus: "idle" });
    try {
      await work();
      return true;
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) });
      return false;
    } finally {
      set({ busy: false });
    }
  }
  async function saveTurn(
    base: TrainingSession,
    key: string,
    calculate: () => Promise<TrainingSession>,
  ) {
    if (pendingWrite?.base !== base || pendingWrite.key !== key) {
      pendingWrite = undefined;
      set({ turnStatus: "responding" });
      try {
        pendingWrite = { base, key, next: await calculate() };
      } catch (error) {
        set({ turnStatus: "replyFailed" });
        throw error;
      }
    }
    set({ turnStatus: "saving" });
    try {
      await commit(pendingWrite.next);
      pendingWrite = undefined;
      set({ turnStatus: "idle" });
    } catch (error) {
      set({ turnStatus: "saveFailed" });
      throw error;
    }
  }
  return {
    sessions: [],
    session: null,
    reportSession: null,
    reviewPlans: [],
    reviewsLoaded: false,
    pendingCourse: null,
    busy: false,
    turnStatus: "idle",
    loaded: false,
    error: null,
    learningMemory: null,
    memoryContributions: [],
    load: async () => {
      await operation(async () => {
        const repos = repositories();
        await repos.users.ensureLocalLearner();
        const rows = await repos.learningEvents.listTrainingCheckpoints();
        const memory = await readLearningMemory(repos);
        const latestSessions = rows.map((row) =>
          trainingSessionSchema.parse(JSON.parse(row.payload)),
        );
        const current = get().session;
        const sessions =
          current && !latestSessions.some((session) => session.id === current.id)
            ? [current, ...latestSessions].slice(0, 50)
            : latestSessions;
        set({
          sessions,
          loaded: true,
          learningMemory: memory.document,
          memoryContributions: memory.contributions,
          session: get().pendingCourse ? null : (get().session ?? sessions[0] ?? null),
        });
      });
    },
    prepare: (course) => {
      if (!get().busy) {
        pendingWrite = undefined;
        set({
          pendingCourse: course ? scenarioContentSchema.parse(course) : null,
          session: null,
          error: null,
          turnStatus: "idle",
        });
      }
    },
    resume: (id) => {
      if (!get().busy)
        set({
          session: get().sessions.find((item) => item.id === id) ?? null,
          pendingCourse: null,
          error: null,
        });
    },
    loadFreeConversation: async (id) => {
      const row = await repositories().learningEvents.findFreeConversationCheckpoint(id);
      if (
        !row ||
        row.id !== `conversation-${id}` ||
        row.userId !== LOCAL_LEARNER_ID ||
        row.type !== "free_conversation_checkpoint"
      )
        throw new Error("The source conversation could not be found");
      const checkpoint = freeConversationCheckpointSchema.parse(JSON.parse(row.payload));
      if (checkpoint.id !== id) throw new Error("Conversation source identity is inconsistent");
      return checkpoint;
    },
    saveFreeConversation: async (raw, signal) =>
      operation(async () => {
        const checkpoint = freeConversationCheckpointSchema.parse(raw);
        const contribution = buildFreeConversationContribution(checkpoint);
        const repos = repositories();
        const current = get().learningMemory;
        const memory = current
          ? { document: current, contributions: get().memoryContributions }
          : await readLearningMemory(repos);
        const contributions = [
          ...memory.contributions.filter((item) => item.lessonId !== checkpoint.id),
          contribution,
        ];
        const learningMemory = projectLearningMemory(
          memory.document.profile,
          contributions,
          memory.document.profileSaved,
        );
        await repos.users.ensureLocalLearner();
        if (signal.aborted) return;
        await repos.learningEvents.saveFreeConversationCheckpoint({
          id: checkpoint.id,
          payload: checkpoint,
          memory: contribution,
        });
        set({ memoryContributions: contributions, learningMemory });
      }),
    freeConversationMemory: async (utterance) => {
      const document = get().learningMemory ?? (await readLearningMemory(repositories())).document;
      const observed = document.knowledge
        .filter((term) => term.language === "en" && term.practiceTurns > 0)
        .map((term) => term.item);
      const relevant = trackVocabulary(utterance, observed).used;
      const targets = [...new Set([...relevant, ...observed])].slice(0, 8);
      return selectLearningMemory(document, "en", targets);
    },
    start: async (course, rawProvider, key) => {
      await operation(async () => {
        const provider = trainingProviderSchema.parse(rawProvider);
        await repositories().users.ensureLocalLearner();
        if (key?.trim()) await saveTrainingKey(provider, key.trim());
        const session = await createTrainingSession(
          course,
          provider,
          await trainingGateway(provider),
          await snapshot(course),
        );
        await commit(session);
      });
    },
    send: async (utterance, speech) =>
      operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await saveTurn(current, JSON.stringify([utterance.trim(), speech]), async () =>
          runTrainingTurn(
            current,
            utterance,
            detectDialogueSupport(utterance) === "repeat"
              ? createMockGateway()
              : await trainingGateway(current.provider),
            undefined,
            await snapshot(current.scenario),
            speech,
          ),
        );
      }),
    finish: async () => {
      await operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await commit(
          await finishTrainingSession(
            current,
            await trainingGateway(current.provider),
            await snapshot(current.scenario),
          ),
        );
      });
    },
    requestSupport: async (rawRequest) =>
      operation(async () => {
        const request = dialogueSupportSchema.parse(rawRequest);
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await saveTurn(current, `support:${request}`, async () =>
          runTrainingTurn(
            current,
            dialogueSupportText[request],
            request === "repeat" ? createMockGateway() : await trainingGateway(current.provider),
            request,
            await snapshot(current.scenario),
          ),
        );
      }),
    endEarly: async () =>
      operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await commit(endTrainingEarly(current));
        pendingWrite = undefined;
      }),
    saveReviewAnswers: async (answers) =>
      operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Complete a course before saving review answers");
        await commit(saveCourseReview(current, answers));
      }),
    saveProfile: async (rawProfile) =>
      operation(async () => {
        await repositories().users.ensureLocalLearner();
        if (!get().learningMemory) {
          const memory = await readLearningMemory(repositories());
          set({ learningMemory: memory.document, memoryContributions: memory.contributions });
        }
        const profile = await writeLearningProfile(repositories(), LOCAL_LEARNER_ID, rawProfile);
        set({ learningMemory: projectLearningMemory(profile, get().memoryContributions, true) });
      }),
    openLesson: async (id) =>
      operation(async () => {
        const row = await repositories().learningEvents.findTrainingCheckpoint(id);
        if (!row) throw new Error("The source lesson could not be found");
        const session = trainingSessionSchema.parse(JSON.parse(row.payload));
        if (session.id !== id) throw new Error("Source lesson identity is inconsistent");
        set({
          session,
          pendingCourse: null,
          sessions: [session, ...get().sessions.filter((item) => item.id !== id)].slice(0, 50),
        });
      }),
    loadReport: async (id) =>
      operation(async () => {
        set({ reportSession: null });
        const row = await repositories().learningEvents.findTrainingCheckpoint(id);
        if (!row) throw new Error("The saved report could not be found");
        const session = trainingSessionSchema.parse(JSON.parse(row.payload));
        if (session.id !== id || session.state.phase !== "done" || !session.report)
          throw new Error("This lesson has no completed report");
        set({ reportSession: session });
      }),
    saveReflection: async (reflection) =>
      operation(async () => {
        const selected = get().reportSession;
        if (!selected) throw new Error("Open a completed report first");
        // Merge into the latest checkpoint so course self-check answers are retained.
        const row = await repositories().learningEvents.findTrainingCheckpoint(selected.id);
        if (!row) throw new Error("The saved report could not be found");
        const current = trainingSessionSchema.parse(JSON.parse(row.payload));
        if (current.id !== selected.id) throw new Error("Report identity is inconsistent");
        await commit(saveReportReflection(current, reflection), false);
      }),
    loadReviews: async () => {
      await operation(async () => {
        const repos = repositories();
        await repos.users.ensureLocalLearner();
        const memory = await readLearningMemory(repos);
        const plans = await readReviewPlans(repos);
        set({
          reviewPlans: plans,
          reviewsLoaded: true,
          learningMemory: memory.document,
          memoryContributions: memory.contributions,
        });
      });
    },
    generateReview: async (id) =>
      operation(async () => {
        const row = await repositories().learningEvents.findTrainingCheckpoint(id);
        if (!row) throw new Error("The source lesson could not be found");
        const source = trainingSessionSchema.parse(JSON.parse(row.payload));
        if (source.id !== id) throw new Error("Review source identity is inconsistent");
        await commit(await generateTrainingReview(source), false);
      }),
    saveReviewAttempt: async (id, taskId, input) =>
      operation(async () => {
        const row = await repositories().learningEvents.findTrainingCheckpoint(id);
        if (!row) throw new Error("The source lesson could not be found");
        const source = trainingSessionSchema.parse(JSON.parse(row.payload));
        if (source.id !== id) throw new Error("Review source identity is inconsistent");
        await commit(saveTrainingReviewAttempt(source, taskId, input), false);
      }),
  };
});

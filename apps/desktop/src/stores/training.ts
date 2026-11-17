import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import {
  scenarioContentSchema,
  dialogueSupportSchema,
  detectDialogueSupport,
  type DialogueSupport,
  type ScenarioContent,
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
} from "@language-lab/memory";
import { call } from "../lib/ipc";
import {
  createTrainingSession,
  finishTrainingSession,
  runTrainingTurn,
  saveCourseReview,
  dialogueSupportText,
  trainingProviderSchema,
  trainingSessionSchema,
  type TrainingProvider,
  type TrainingSession,
} from "../training/session";
import { saveTrainingKey, trainingGateway } from "../training/gateway";
import { buildLearningContribution } from "../training/learningMemory";
import { LOCAL_LEARNER_ID, readLearningMemory } from "../training/learningMemoryPersistence";

const repositories = () => createRepositories(createTauriTransport(call));

interface TrainingStore {
  sessions: TrainingSession[];
  session: TrainingSession | null;
  pendingCourse: ScenarioContent | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  learningMemory: LearningMemoryDocument | null;
  memoryContributions: LessonMemoryContribution[];
  saveProfile: (profile: LearningProfile) => Promise<boolean>;
  openLesson: (id: string) => Promise<boolean>;
  load: () => Promise<void>;
  prepare: (course?: ScenarioContent) => void;
  resume: (id: string) => void;
  start: (course: ScenarioContent, provider: TrainingProvider, key?: string) => Promise<void>;
  send: (utterance: string) => Promise<boolean>;
  requestSupport: (request: DialogueSupport) => Promise<boolean>;
  finish: () => Promise<void>;
  updateKey: (key: string) => Promise<void>;
  saveReviewAnswers: (answers: Record<string, string>) => Promise<boolean>;
}

export const useTrainingStore = create<TrainingStore>((set, get) => {
  async function commit(session: TrainingSession) {
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
    });
    set({
      session: checkpoint,
      pendingCourse: null,
      memoryContributions: contributions,
      learningMemory,
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
    set({ busy: true, error: null });
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
  return {
    sessions: [],
    session: null,
    pendingCourse: null,
    busy: false,
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
      if (!get().busy)
        set({
          pendingCourse: course ? scenarioContentSchema.parse(course) : null,
          session: null,
          error: null,
        });
    },
    resume: (id) => {
      if (!get().busy)
        set({
          session: get().sessions.find((item) => item.id === id) ?? null,
          pendingCourse: null,
          error: null,
        });
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
    send: async (utterance) =>
      operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        const next = await runTrainingTurn(
          current,
          utterance,
          detectDialogueSupport(utterance) === "repeat"
            ? createMockGateway()
            : await trainingGateway(current.provider),
          undefined,
          await snapshot(current.scenario),
        );
        await commit(next);
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
        await commit(
          await runTrainingTurn(
            current,
            dialogueSupportText[request],
            request === "repeat" ? createMockGateway() : await trainingGateway(current.provider),
            request,
            await snapshot(current.scenario),
          ),
        );
      }),
    updateKey: async (key) => {
      await operation(async () => {
        const current = get().session;
        if (!current || current.provider.mode !== "ai" || !key.trim())
          throw new Error("Enter an API key for the current AI connection");
        await saveTrainingKey(current.provider, key.trim());
      });
    },
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
  };
});

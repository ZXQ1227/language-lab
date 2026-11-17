import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { scenarioContentSchema, type ScenarioContent } from "@language-lab/core";
import { call } from "../lib/ipc";
import {
  createTrainingSession,
  finishTrainingSession,
  runTrainingTurn,
  saveCourseReview,
  trainingProviderSchema,
  trainingSessionSchema,
  type TrainingProvider,
  type TrainingSession,
} from "../training/session";
import { saveTrainingKey, trainingGateway } from "../training/gateway";

const repositories = () => createRepositories(createTauriTransport(call));

interface TrainingStore {
  sessions: TrainingSession[];
  session: TrainingSession | null;
  pendingCourse: ScenarioContent | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  prepare: (course?: ScenarioContent) => void;
  resume: (id: string) => void;
  start: (course: ScenarioContent, provider: TrainingProvider, key?: string) => Promise<void>;
  send: (utterance: string) => Promise<boolean>;
  finish: () => Promise<void>;
  updateKey: (key: string) => Promise<void>;
  saveReviewAnswers: (answers: Record<string, string>) => Promise<boolean>;
}

export const useTrainingStore = create<TrainingStore>((set, get) => {
  async function commit(session: TrainingSession) {
    const checkpoint = trainingSessionSchema.parse(session);
    await repositories().learningEvents.saveTrainingCheckpoint({
      id: checkpoint.id,
      payload: checkpoint,
    });
    set({
      session: checkpoint,
      pendingCourse: null,
      sessions: [checkpoint, ...get().sessions.filter((item) => item.id !== checkpoint.id)].slice(
        0,
        50,
      ),
    });
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
    load: async () => {
      await operation(async () => {
        const repos = repositories();
        await repos.users.ensureLocalLearner();
        const rows = await repos.learningEvents.listTrainingCheckpoints();
        const sessions = rows.map((row) => trainingSessionSchema.parse(JSON.parse(row.payload)));
        set({
          sessions,
          loaded: true,
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
          await trainingGateway(current.provider),
        );
        await commit(next);
      }),
    finish: async () => {
      await operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await commit(await finishTrainingSession(current, await trainingGateway(current.provider)));
      });
    },
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
  };
});

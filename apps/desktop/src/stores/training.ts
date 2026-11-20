import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import {
  scenarioContentSchema,
  dialogueSupportSchema,
  detectDialogueSupport,
  getCurrentCourseStage,
  learnerPracticeText,
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
  getGuidedExample,
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
import {
  LOCAL_LEARNER_ID,
  readLearningMemory,
  readMemoryReuse,
} from "../training/learningMemoryPersistence";
import { readReviewPlans } from "../training/reviewPersistence";
import { readTravelTransferTasks, type TravelTransferTask } from "../training/travelTransfer";
import {
  buildFreeConversationContribution,
  freeConversationCheckpointSchema,
  type FreeConversationCheckpoint,
} from "../conversation/checkpoint";

import { courseSpeakingHint, checkAuthoredSpeaking } from "../practice/authored";
import {
  assessSpeaking,
  generateSpeakingHint,
  recentSpeakingMessages,
} from "../practice/generation";
import {
  latestSpeakingHint,
  replaceSpeakingHint,
  sameSpeakingTransferVersion,
  type SpeakingHintRecord,
  type SpeakingTransfer,
} from "../practice/records";

const repositories = () => createRepositories(createTauriTransport(call));

interface TrainingStore {
  sessions: TrainingSession[];
  session: TrainingSession | null;
  reportSession: TrainingSession | null;
  reviewPlans: ReviewPlan[];
  travelTransfers: TravelTransferTask[];
  openTravelTransfer: (sourceId: string) => Promise<boolean>;
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
  reuseAcrossSessions: boolean | null;
  setMemoryReuse: (enabled: boolean) => Promise<boolean>;
  deletePracticeSource: (id: string, source: "training" | "free-conversation") => Promise<boolean>;
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
  requestSpeakingHint: (base: TrainingSession, draft: string, signal: AbortSignal) => Promise<void>;
  loadSpeakingSource: (lessonId: string) => Promise<TrainingSession>;
  saveSpeakingTransfer: (
    report: TrainingSession,
    lessonId: string,
    anchorSeq: number,
    next: SpeakingTransfer,
    expected: SpeakingTransfer | undefined,
    signal: AbortSignal,
  ) => Promise<boolean>;
  requestSupport: (request: DialogueSupport) => Promise<boolean>;
  finish: () => Promise<void>;
  endEarly: () => Promise<boolean>;
  saveReviewAnswers: (answers: Record<string, string>) => Promise<boolean>;
}

export const useTrainingStore = create<TrainingStore>((set, get) => {
  let pendingWrite: { base: TrainingSession; key: string; next: TrainingSession } | undefined;

  async function commit(session: TrainingSession, activate = true) {
    const contribution = buildLearningContribution(session);
    const checkpoint = trainingSessionSchema.parse({ ...session, learningMemory: contribution });
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
  async function loadSpeakingSource(id: string) {
    const row = await repositories().learningEvents.findTrainingCheckpoint(id);
    if (
      !row ||
      row.userId !== LOCAL_LEARNER_ID ||
      row.type !== "training_checkpoint" ||
      row.id !== `training-${id}`
    )
      throw new Error("Practice source is unavailable");
    const session = trainingSessionSchema.parse(JSON.parse(row.payload));
    if (session.id !== id) throw new Error("Invalid practice source");
    return session;
  }
  async function teachingMemory() {
    const repos = repositories();
    let document = get().learningMemory;
    if (!document) {
      const loaded = await readLearningMemory(repos);
      document = loaded.document;
      set({ learningMemory: loaded.document, memoryContributions: loaded.contributions });
    }
    const enabled = get().reuseAcrossSessions ?? (await readMemoryReuse(repos));
    return enabled ? document : { ...document, knowledge: [], errors: [], episodes: [] };
  }
  async function snapshot(course: ScenarioContent) {
    return selectLearningMemory(
      await teachingMemory(),
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
    travelTransfers: [],
    reviewsLoaded: false,
    pendingCourse: null,
    busy: false,
    turnStatus: "idle",
    loaded: false,
    error: null,
    learningMemory: null,
    memoryContributions: [],
    reuseAcrossSessions: null,
    setMemoryReuse: async (enabled) =>
      operation(async () => {
        const repos = repositories();
        await repos.users.ensureLocalLearner();
        await repos.learningEvents.saveMemorySettings({ version: 1, reuseAcrossSessions: enabled });
        pendingWrite = undefined;
        set({ reuseAcrossSessions: enabled });
      }),
    deletePracticeSource: async (id, source) =>
      operation(async () => {
        const repos = repositories();
        const current = get();
        if (
          !current.learningMemory ||
          !current.memoryContributions.some(
            (item) => item.lessonId === id && (item.source ?? "training") === source,
          )
        )
          throw new Error("The practice source could not be found");
        const contributions = current.memoryContributions.filter((item) => item.lessonId !== id);
        const document = projectLearningMemory(
          current.learningMemory.profile,
          contributions,
          current.learningMemory.profileSaved,
        );
        await repos.learningEvents.deletePracticeSource(id, source);
        if (pendingWrite?.base.id === id) pendingWrite = undefined;
        set({
          learningMemory: document,
          memoryContributions: contributions,
          sessions: current.sessions.filter((item) => item.id !== id),
          ...(current.session?.id === id ? { session: null } : {}),
          ...(current.reportSession?.id === id ? { reportSession: null } : {}),
          reviewPlans: current.reviewPlans.filter((plan) => plan.lessonId !== id),
        });
      }),
    load: async () => {
      await operation(async () => {
        const repos = repositories();
        await repos.users.ensureLocalLearner();
        const rows = await repos.learningEvents.listTrainingCheckpoints();
        const [memory, reuseAcrossSessions] = await Promise.all([
          readLearningMemory(repos),
          readMemoryReuse(repos),
        ]);
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
          reuseAcrossSessions,
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
      const document = await teachingMemory();
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
    requestSpeakingHint: async (base, draft, signal) => {
      const stage = getCurrentCourseStage(base.state);
      const template = base.state.courseTemplate;
      const anchorSeq = base.messages.length - 1;
      if (!stage || !template || latestSpeakingHint(base.speakingPractice, anchorSeq)) return;
      let source: SpeakingHintRecord["source"] = "authored";
      let hint = courseSpeakingHint(base, draft, getGuidedExample(base));
      if (base.provider.mode === "ai" && !hint?.authoredId) {
        const gateway = await trainingGateway(base.provider);
        hint = await generateSpeakingHint(
          gateway,
          {
            draft: draft.trim().slice(0, 800),
            history: recentSpeakingMessages(base.messages),
            language: template.targetLanguage,
            course: {
              difficulty: base.state.difficulty,
              setting: template.setting.slice(0, 800),
              learnerRole: template.roles.learner.slice(0, 240),
              stage: stage.instruction.slice(0, 500),
            },
          },
          signal,
        );
        source = "ai";
      }
      signal.throwIfAborted();
      if (!hint) throw new Error("No example is available for the current stage");
      const record = { ...hint, anchorSeq, stageId: stage.id, source, shownAt: Date.now() };
      const saved = await operation(async () => {
        signal.throwIfAborted();
        if (get().session !== base) throw new Error("The conversation has moved on");
        await commit({
          ...base,
          speakingPractice: replaceSpeakingHint(base.speakingPractice, record),
        });
      });
      if (!saved) throw new Error("Could not save practice hint");
    },
    loadSpeakingSource,
    saveSpeakingTransfer: async (report, id, anchorSeq, next, expected, signal) =>
      operation(async () => {
        signal.throwIfAborted();
        const source = await loadSpeakingSource(id);
        if (source.state.phase !== "done") throw new Error("Practice source is unfinished");
        if (
          id !== report.id &&
          (!(await readMemoryReuse(repositories())) ||
            source.scenario.category !== report.scenario.category ||
            source.state.courseTemplate?.targetLanguage !==
              report.state.courseTemplate?.targetLanguage)
        )
          throw new Error("Saved expressions are unavailable for this lesson");
        signal.throwIfAborted();
        const hint = latestSpeakingHint(source.speakingPractice, anchorSeq);
        if (!hint || !sameSpeakingTransferVersion(hint.transfer, expected))
          throw new Error("The speaking practice has changed");
        await commit(
          {
            ...source,
            speakingPractice: replaceSpeakingHint(source.speakingPractice, {
              ...hint,
              transfer: next,
            }),
          },
          false,
        );
      }),
    send: async (utterance, speech) =>
      operation(async () => {
        const current = get().session;
        if (!current) throw new Error("Start or resume a lesson first");
        await saveTurn(current, JSON.stringify([utterance.trim(), speech]), async () => {
          const gateway =
            detectDialogueSupport(utterance) === "repeat"
              ? createMockGateway()
              : await trainingGateway(current.provider);
          const next = await runTrainingTurn(
            current,
            utterance,
            gateway,
            undefined,
            await snapshot(current.scenario),
            speech,
          );
          const hint = latestSpeakingHint(current.speakingPractice, current.messages.length - 1);
          const messageSeq = current.messages.length;
          const text = learnerPracticeText(next.messages[messageSeq]!);
          if (!hint || !text) return next;
          const assessment =
            hint.source === "authored" && current.provider.mode === "demo"
              ? checkAuthoredSpeaking(hint, text)
              : await assessSpeaking(gateway, hint.intent, text);
          return {
            ...next,
            speakingPractice: replaceSpeakingHint(next.speakingPractice, {
              ...hint,
              answer: { messageSeq, assessment, at: Math.max(Date.now(), hint.shownAt) },
            }),
          };
        });
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
        const [plans, travelTransfers] = await Promise.all([
          readReviewPlans(repos),
          readTravelTransferTasks(repos),
        ]);
        set({
          reviewPlans: plans,
          travelTransfers,
          reviewsLoaded: true,
          learningMemory: memory.document,
          memoryContributions: memory.contributions,
        });
      });
    },
    openTravelTransfer: async (sourceId) =>
      operation(async () => {
        const task = (await readTravelTransferTasks(repositories())).find(
          (entry) => entry.source.id === sourceId,
        );
        if (!task || Date.now() < task.dueAt)
          throw new Error("Travel practice is not available yet");
        pendingWrite = undefined;
        if (task.attempt) {
          set({ session: task.attempt, pendingCourse: null });
          return;
        }
        const session = await createTrainingSession(
          task.course,
          task.source.provider,
          await trainingGateway(task.source.provider),
          await snapshot(task.course),
        );
        await commit({ ...session, travelTransfer: { sourceLessonId: sourceId } });
      }),
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

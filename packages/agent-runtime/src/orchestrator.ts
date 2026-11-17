// TeachingOrchestrator - the single teaching agent (blueprint 3.1).
//
// One turn = structured analysis skills (diagnosis + vocabulary) ->
// deterministic teaching decision (TeachingIntervention) ->
// in-character reply generation (DialogueRoleplay) -> state update ->
// persistence. Analysis and reply generation are separate skill calls,
// never one giant prompt.

import {
  applyTeachingAction,
  applyStageAssessment,
  createInitialLessonState,
  createLessonStateFromScenario,
  getCurrentCourseStage,
  dialogueSupportSchema,
  detectDialogueSupport,
  mergeDialogueMemory,
  validateDiagnosisRecords,
  validateDiagnosedErrors,
  advanceInterventionState,
  lightCorrectionReplyIssue,
  type ErrorDiagnosisRecord,
  type LessonState,
  type StageAssessment,
} from "@language-lab/core";
import type {
  ErrorDiagnosisOutput,
  LessonEvaluatorOutput,
  SkillContext,
  StudentProfileView,
  DialogueRoleplayOutput,
  VocabularyTrackerOutput,
  TeachingInterventionOutput,
} from "@language-lab/skills";
import { SkillValidationError } from "@language-lab/skills";
import type { AgentEvent } from "./events";
import type { OrchestratorDeps } from "./ports";
import type { AgentInput, AgentOutput, LessonInitInput, LessonInitOutput } from "./types";

export class LessonNotInitializedError extends Error {
  constructor(lessonId: string) {
    super(`lesson state not found for "${lessonId}" - call initLesson() first`);
    this.name = "LessonNotInitializedError";
  }
}

interface SkillTraceEntry {
  skillId: string;
  durationMs: number;
  ok: boolean;
}

export class TeachingOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private get now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private emit(event: AgentEvent): void {
    this.deps.onEvent?.(event);
  }

  /** Builds the SkillContext handed to every skill execution. */
  private async buildContext(
    input: Pick<AgentInput, "userId" | "lessonId" | "conversationId">,
    state: LessonState,
    profile: StudentProfileView,
  ): Promise<SkillContext> {
    const memory = await this.deps.memory.snapshot(input.userId);
    return {
      userId: input.userId,
      lessonId: input.lessonId,
      conversationId: input.conversationId,
      studentProfile: {
        ...profile,
        level: state.difficulty,
        targetLanguage: state.courseTemplate?.targetLanguage ?? profile.targetLanguage,
      },
      lessonState: state,
      memory,
      modelGateway: this.deps.gateway,
      data: this.deps.data,
    };
  }

  /** Runs one skill with timing + lifecycle events. */
  private async runSkill<T>(
    skillId: string,
    input: unknown,
    context: SkillContext,
    trace: SkillTraceEntry[],
  ): Promise<T> {
    this.emit({
      kind: "skill_started",
      at: this.now,
      skillId,
    });
    const started = this.now;
    try {
      const result = await this.deps.skills.call<T>(skillId, input, context);
      trace.push({ skillId, durationMs: this.now - started, ok: true });
      this.emit({
        kind: "skill_completed",
        at: this.now,
        skillId,
        durationMs: this.now - started,
      });
      return result;
    } catch (error) {
      trace.push({ skillId, durationMs: this.now - started, ok: false });
      this.emit({
        kind: "skill_failed",
        at: this.now,
        skillId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Starts a new lesson: selects the scenario, builds the initial state and
   * persists it. Must be called before processStudentTurn for a lesson id.
   */
  async initLesson(input: LessonInitInput): Promise<LessonInitOutput> {
    const profile = await this.deps.profile.profile(input.userId);
    const context = await this.buildContext(
      input,
      createInitialLessonState({
        lessonId: input.lessonId,
        scenarioId: "pending",
        now: this.now,
      }),
      profile,
    );

    const selection = await this.runSkill<{ scenarioId: string; rationale: string }>(
      "skills.scenario_selector",
      {
        candidates: input.scenarioCandidates,
        studentGoals: [...input.studentGoals],
        studentLevel: input.studentLevel,
      },
      context,
      [],
    );

    const scenario = await this.deps.data.findScenario(selection.scenarioId);
    if (!scenario) {
      throw new Error(`scenario not found: ${selection.scenarioId}`);
    }

    const state = createLessonStateFromScenario({
      lessonId: input.lessonId,
      scenario,
      configuration: input.configuration,
      now: this.now,
    });
    await this.deps.stateStore.save(state);
    this.emit({
      kind: "lesson_initialized",
      at: this.now,
      lessonId: input.lessonId,
      scenarioId: scenario.id,
    });
    return { state, scenarioId: scenario.id, rationale: selection.rationale };
  }

  /** Processes one student turn end-to-end. */
  async processStudentTurn(input: AgentInput): Promise<AgentOutput> {
    const startedAt = this.now;
    const turnId = `turn-${startedAt}-${Math.floor(Math.random() * 1e6)}`;
    const trace: SkillTraceEntry[] = [];

    const state = await this.deps.stateStore.load(input.lessonId);
    if (!state) throw new LessonNotInitializedError(input.lessonId);
    if (state.phase === "setup") throw new Error("Complete lesson setup before practising");
    if (state.phase === "done" || state.phase === "debrief")
      throw new Error("Practice has ended; finish and review this lesson");
    if (!input.utterance.trim() || input.utterance.length > 4000)
      throw new Error("Enter a reply between 1 and 4000 characters");

    const profile = await this.deps.profile.profile(input.userId);
    const context = await this.buildContext(input, state, profile);
    const support =
      input.supportRequest !== undefined
        ? dialogueSupportSchema.parse(input.supportRequest)
        : detectDialogueSupport(input.utterance);
    if (
      support === "hint" &&
      state.hintsGiven >= (state.courseTemplate?.teachingPolicy.maxHints ?? 3)
    )
      throw new Error("The lesson hint budget is exhausted");

    const recentMessages = (await this.deps.data.recentMessages(input.conversationId, 200)).slice(
      -200,
    );

    // 1. Structured analysis (two independent skills).
    const diagnosis: ErrorDiagnosisOutput = support
      ? {
          errors: [],
          fluency: "not_assessed",
          intent: `support:${support}`,
          source: "model",
          status: "checked",
          withheldCount: 0,
        }
      : await this.runSkill<ErrorDiagnosisOutput>(
          "skills.error_diagnosis",
          {
            utterance: input.utterance,
            studentLevel: state.difficulty,
            recentMessages: recentMessages.slice(-6),
          },
          context,
          trace,
        );

    validateDiagnosedErrors(input.utterance, diagnosis.errors);
    const vocabulary = support
      ? { used: [], missed: [], matches: [] }
      : await this.runSkill<VocabularyTrackerOutput>(
          "skills.vocabulary_tracker",
          {
            utterance: input.utterance,
            targetVocabulary: [...state.targetVocabulary],
            vocabularyForms: state.courseTemplate?.learningPack?.vocabulary.map((item) => ({
              term: item.term,
              forms: item.forms ?? [],
            })),
          },
          context,
          trace,
        );

    const transcript = [
      ...recentMessages,
      {
        seq: Math.max(-1, ...recentMessages.map((message) => message.seq)) + 1,
        role: "user" as const,
        content: input.utterance,
        ...(support ? { purpose: "support" as const } : {}),
      },
    ];
    let assessedState = state;
    let assessment: StageAssessment | undefined;
    const stage = getCurrentCourseStage(state);
    if (stage && !support) {
      assessment = await this.runSkill<StageAssessment>(
        "skills.objective_evaluator",
        {
          stage,
          objectives: state.objectives.filter((objective) =>
            stage.objectiveIds.includes(objective.id),
          ),
          transcript,
          previousAssessment: state.stageAssessments?.[stage.id],
        },
        context,
        trace,
      );
      assessedState = applyStageAssessment(
        { ...state, phase: "practice" },
        assessment,
        transcript,
        this.now,
      );
      assessment = assessedState.stageAssessments?.[stage.id];
    }
    const assessedContext = { ...context, lessonState: assessedState };

    // 2. Deterministic teaching decision (rule-based skill).
    const intervention: TeachingInterventionOutput = support
      ? {
          action:
            support === "hint" ? ("provide_hint" as const) : ("continue_conversation" as const),
          rationale: `Learner requested ${support}; do not assess this control message`,
          correction: undefined,
          reason: "support_request",
        }
      : await this.runSkill<TeachingInterventionOutput>(
          "skills.teaching_intervention",
          {
            errors: diagnosis.errors,
            fluency: diagnosis.fluency,
            hintsGiven: state.hintsGiven,
            correctionsGiven: state.correctionsGiven,
            allObjectivesCompleted:
              assessedState.objectives.length > 0 &&
              assessedState.objectives.every((o) => o.completed),
            objectiveCount: state.objectives.length,
            policy: state.courseTemplate?.teachingPolicy,
            history: state.interventionState,
          },
          assessedContext,
          trace,
        );
    this.emit({
      kind: "decision_made",
      at: this.now,
      action: intervention.action,
      rationale: intervention.rationale,
    });
    const correction =
      intervention.action === "light_correction"
        ? diagnosis.errors.find(
            (error) =>
              error.original === intervention.correction?.original &&
              error.start === intervention.correction.start &&
              error.end === intervention.correction.end &&
              error.corrected === intervention.correction.corrected &&
              error.explanation === intervention.correction.explanation,
          )
        : undefined;
    if (intervention.action === "light_correction" && !correction)
      throw new Error("Teaching correction must reference a validated diagnosis");

    // 3. In-character reply generation.
    const nextStage = getCurrentCourseStage(assessedState);
    const roleplay = await this.runSkill<DialogueRoleplayOutput>(
      "skills.dialogue_roleplay",
      {
        roleCard: {
          persona:
            state.courseTemplate?.roles.partner ??
            `a friendly language tutor for the "${state.scenarioId}" scenario`,
          setting:
            state.courseTemplate?.setting ??
            `practice conversation, difficulty ${state.difficulty}`,
          character: state.courseTemplate?.character,
        },
        course: state.courseTemplate
          ? {
              targetLanguage: state.courseTemplate.targetLanguage,
              learnerRole: state.courseTemplate.roles.learner,
              difficulty: state.difficulty,
              targetVocabulary: [...state.targetVocabulary],
              targetPatterns: state.courseTemplate.targetPatterns,
              stage: nextStage,
              previousStage: stage && nextStage?.id !== stage.id ? stage : undefined,
              assessment: nextStage ? assessedState.stageAssessments?.[nextStage.id] : undefined,
              scenarioFacts: state.courseTemplate.learningPack?.scenarioFacts,
              allowHints: state.hintsGiven < state.courseTemplate.teachingPolicy.maxHints,
            }
          : undefined,
        utterance: input.utterance,
        supportRequest: support,
        learnerMemory: state.dialogueMemory,
        previousMove: state.lastDialogueMove,
        intervention: {
          action: intervention.action,
          correction,
          note: intervention.correction
            ? `Correct gently: "${intervention.correction.original}" -> "${intervention.correction.corrected}" (${intervention.correction.explanation})`
            : undefined,
        },
        recentMessages: recentMessages.slice(-20),
      },
      assessedContext,
      trace,
    );

    if (correction) {
      const issue = lightCorrectionReplyIssue(roleplay.reply, correction);
      if (issue) throw new Error(issue);
    }

    // 4. Deterministic state update + domain events.
    const vocabularyUsed = vocabulary.used;
    const memory = mergeDialogueMemory(
      state.dialogueMemory ?? [],
      roleplay.memoryUpdates ?? [],
      transcript,
    );
    const dialogueMove =
      roleplay.move ??
      support ??
      (intervention.action === "complete_task"
        ? "close"
        : intervention.action === "provide_hint"
          ? "hint"
          : "respond");
    const newState = applyTeachingAction(
      {
        ...assessedState,
        ...(memory.length || state.dialogueMemory ? { dialogueMemory: memory } : {}),
        lastDialogueMove: dialogueMove,
        ...(!support
          ? {
              interventionState: advanceInterventionState(
                state.interventionState ?? {
                  version: 1,
                  practiceTurns: state.turnCount,
                  corrections: [],
                },
                correction,
              ),
            }
          : {}),
      },
      intervention.action,
      {
        vocabularyUsed,
        now: this.now,
      },
    );

    const persistedEvents: { type: string; payload?: Record<string, unknown> }[] = [];
    if (!support)
      persistedEvents.push({
        type: "utterance_diagnosed",
        payload: { messageSeq: transcript.at(-1)!.seq, diagnosis },
      });
    if (!support)
      persistedEvents.push({
        type: "teaching_intervention_decided",
        payload: {
          messageSeq: transcript.at(-1)!.seq,
          action: intervention.action,
          reason: intervention.reason,
        },
      });
    if (support)
      persistedEvents.push({ type: "dialogue_support_requested", payload: { request: support } });
    if (roleplay.memoryUpdates?.length)
      persistedEvents.push({
        type: "dialogue_memory_updated",
        payload: { items: roleplay.memoryUpdates },
      });
    if (assessment) persistedEvents.push({ type: "stage_assessed", payload: { ...assessment } });
    for (const word of vocabularyUsed) {
      persistedEvents.push({
        type: "vocabulary_used",
        payload: {
          word,
          messageSeq: transcript.at(-1)!.seq,
          matches: vocabulary.matches.filter((match) => match.term === word),
        },
      });
    }
    for (const error of diagnosis.errors) {
      persistedEvents.push({
        type: "error_made",
        payload: { ...error, messageSeq: transcript.at(-1)!.seq },
      });
    }
    const newlyCompleted = newState.objectives.filter(
      (o, i) => o.completed && !state.objectives[i]?.completed,
    );
    for (const objective of newlyCompleted) {
      persistedEvents.push({ type: "objective_completed", payload: { id: objective.id } });
    }
    if (intervention.correction) {
      persistedEvents.push({
        type: "correction_given",
        payload: { ...correction, messageSeq: transcript.at(-1)!.seq },
      });
    }

    // 5. Persistence through ports (skills never write data themselves).
    for (const event of persistedEvents) {
      await this.deps.data.recordLearningEvent(event);
    }
    await this.deps.stateStore.save(newState);
    this.emit({
      kind: "state_persisted",
      at: this.now,
      phase: newState.phase,
      turnCount: newState.turnCount,
    });

    const elapsedMs = this.now - startedAt;
    this.emit({ kind: "turn_completed", at: this.now, durationMs: elapsedMs });

    return {
      turnId,
      reply: roleplay.reply,
      teachingAction: intervention.action,
      analysis: {
        intent: diagnosis.intent,
        vocabularyUsed,
        vocabularyMissed: vocabulary.missed,
        vocabularyMatches: vocabulary.matches,
        errors: diagnosis.errors,
        diagnosis: support ? undefined : diagnosis,
        fluency: support ? "not_assessed" : diagnosis.fluency,
      },
      state: newState,
      assessment,
      dialogueMove,
      supportRequest: support,
      correction,
      interventionReason: support ? undefined : intervention.reason,
      persistedEvents,
      skillTrace: trace,
      elapsedMs,
    };
  }

  async finishLesson(
    input: Pick<AgentInput, "userId" | "lessonId" | "conversationId"> & {
      diagnoses?: readonly ErrorDiagnosisRecord[];
    },
  ): Promise<{ state: LessonState; report: LessonEvaluatorOutput }> {
    const state = await this.deps.stateStore.load(input.lessonId);
    if (!state) throw new LessonNotInitializedError(input.lessonId);
    if (state.phase !== "debrief")
      throw new Error("Complete the lesson objectives before requesting a review");
    const profile = await this.deps.profile.profile(input.userId);
    const context = await this.buildContext(input, state, profile);
    const transcript = await this.deps.data.recentMessages(input.conversationId, 200);
    validateDiagnosisRecords(input.diagnoses ?? [], transcript);
    const report = await this.runSkill<LessonEvaluatorOutput>(
      "skills.lesson_evaluator",
      {
        transcript,
        diagnoses: input.diagnoses,
        vocabularySeen: state.vocabularySeen,
        correctionsGiven: state.correctionsGiven,
        objectivesCompleted: state.objectives.filter((objective) => objective.completed).length,
        objectiveCount: state.objectives.length,
      },
      context,
      [],
    );
    const done: LessonState = { ...state, phase: "done", updatedAt: this.now };
    await this.deps.stateStore.save(done);
    return { state: done, report };
  }
}

/** Convenience factory. */
export function createTeachingOrchestrator(deps: OrchestratorDeps): TeachingOrchestrator {
  return new TeachingOrchestrator(deps);
}

// Re-export for orchestrator consumers that need to catch boundary errors.
export { SkillValidationError };

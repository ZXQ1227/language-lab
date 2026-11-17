// TeachingOrchestrator - the single teaching agent (blueprint 3.1).
//
// One turn = structured analysis skills (diagnosis + vocabulary) ->
// deterministic teaching decision (TeachingIntervention) ->
// in-character reply generation (DialogueRoleplay) -> state update ->
// persistence. Analysis and reply generation are separate skill calls,
// never one giant prompt.

import {
  applyTeachingAction,
  createInitialLessonState,
  type LessonState,
} from "@language-lab/core";
import type { DiagnosedError, SkillContext, StudentProfileView } from "@language-lab/skills";
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
      studentProfile: profile,
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

    const state = createInitialLessonState({
      lessonId: input.lessonId,
      scenarioId: scenario.id,
      difficulty: scenario.difficulty,
      objectives: scenario.objectives.map((description, i) => ({
        id: `obj-${i + 1}`,
        description,
      })),
      targetVocabulary: scenario.targetVocabulary,
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

    const profile = await this.deps.profile.profile(input.userId);
    const context = await this.buildContext(input, state, profile);

    // 1. Structured analysis (two independent skills).
    const diagnosis = await this.runSkill<{
      errors: DiagnosedError[];
      fluency: "fluent" | "hesitant" | "halting";
      intent: string;
    }>(
      "skills.error_diagnosis",
      { utterance: input.utterance, studentLevel: profile.level },
      context,
      trace,
    );

    const vocabulary = await this.runSkill<{ used: string[]; missed: string[] }>(
      "skills.vocabulary_tracker",
      { utterance: input.utterance, targetVocabulary: [...state.targetVocabulary] },
      context,
      trace,
    );

    // 2. Deterministic teaching decision (rule-based skill).
    const intervention = await this.runSkill<{
      action: AgentOutput["teachingAction"];
      rationale: string;
      correction?: { original: string; corrected: string; explanation: string };
    }>(
      "skills.teaching_intervention",
      {
        errors: diagnosis.errors,
        fluency: diagnosis.fluency,
        hintsGiven: state.hintsGiven,
        correctionsGiven: state.correctionsGiven,
        allObjectivesCompleted:
          state.objectives.length > 0 && state.objectives.every((o) => o.completed),
        objectiveCount: state.objectives.length,
      },
      context,
      trace,
    );
    this.emit({
      kind: "decision_made",
      at: this.now,
      action: intervention.action,
      rationale: intervention.rationale,
    });

    // 3. In-character reply generation.
    const roleplay = await this.runSkill<{ reply: string; tone: string }>(
      "skills.dialogue_roleplay",
      {
        roleCard: {
          persona: `a friendly language tutor for the "${state.scenarioId}" scenario`,
          setting: `practice conversation, difficulty ${state.difficulty}`,
        },
        utterance: input.utterance,
        intervention: {
          action: intervention.action,
          note: intervention.correction
            ? `Correct gently: "${intervention.correction.original}" -> "${intervention.correction.corrected}" (${intervention.correction.explanation})`
            : undefined,
        },
        recentMessages: (await this.deps.data.recentMessages(input.conversationId, 10)).slice(-10),
      },
      context,
      trace,
    );

    // 4. Deterministic state update + domain events.
    const vocabularyUsed = vocabulary.used;
    const newState = applyTeachingAction(state, intervention.action, {
      vocabularyUsed,
      now: this.now,
    });

    const persistedEvents: { type: string; payload?: Record<string, unknown> }[] = [];
    for (const word of vocabularyUsed) {
      persistedEvents.push({ type: "vocabulary_used", payload: { word } });
    }
    for (const error of diagnosis.errors) {
      persistedEvents.push({
        type: "error_made",
        payload: { category: error.category, original: error.original, corrected: error.corrected },
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
        payload: { ...intervention.correction },
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
        errors: diagnosis.errors,
        fluency: diagnosis.fluency,
      },
      state: newState,
      persistedEvents,
      skillTrace: trace,
      elapsedMs,
    };
  }
}

/** Convenience factory. */
export function createTeachingOrchestrator(deps: OrchestratorDeps): TeachingOrchestrator {
  return new TeachingOrchestrator(deps);
}

// Re-export for orchestrator consumers that need to catch boundary errors.
export { SkillValidationError };

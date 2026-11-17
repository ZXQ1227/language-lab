// AgentEvent - observable lifecycle events emitted during one orchestrator
// turn. The UI (or any observer) subscribes via OrchestratorDeps.onEvent;
// events are diagnostics only, never a data path.

import type { LessonPhase, TeachingAction } from "@language-lab/core";

export type AgentEvent =
  | { kind: "turn_started"; at: number; turnId: string }
  | { kind: "skill_started"; at: number; skillId: string }
  | { kind: "skill_completed"; at: number; skillId: string; durationMs: number }
  | { kind: "skill_failed"; at: number; skillId: string; error: string }
  | { kind: "decision_made"; at: number; action: TeachingAction; rationale: string }
  | { kind: "state_persisted"; at: number; phase: LessonPhase; turnCount: number }
  | { kind: "turn_completed"; at: number; durationMs: number }
  | { kind: "lesson_initialized"; at: number; lessonId: string; scenarioId: string };

export type AgentEventListener = (event: AgentEvent) => void;

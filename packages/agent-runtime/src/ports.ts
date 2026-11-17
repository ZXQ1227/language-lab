// Ports - the narrow interfaces the orchestrator needs from the outside
// world. The composition root (apps/desktop) wires them to real
// repositories over Tauri IPC; tests wire in-memory fakes.
//
// The orchestrator itself is the only component that persists through these
// ports: skills never touch data access (Task 06 boundary rule).

import type { LessonState } from "@language-lab/core";
import type { MemorySnapshot } from "@language-lab/memory";
import type { ModelGateway } from "@language-lab/model-gateway";
import type { SkillDataPorts, SkillRegistry, StudentProfileView } from "@language-lab/skills";
import type { AgentEventListener } from "./events";

/** Serializable persistence for teaching state. */
export interface LessonStateStore {
  load(lessonId: string): Promise<LessonState | null>;
  save(state: LessonState): Promise<void>;
}

export interface MemoryPort {
  snapshot(userId: string): Promise<MemorySnapshot>;
}

export interface ProfilePort {
  profile(userId: string): Promise<StudentProfileView>;
}

export interface OrchestratorDeps {
  readonly skills: SkillRegistry;
  readonly gateway: ModelGateway;
  readonly stateStore: LessonStateStore;
  readonly memory: MemoryPort;
  readonly profile: ProfilePort;
  readonly data: SkillDataPorts;
  readonly onEvent?: AgentEventListener;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
}

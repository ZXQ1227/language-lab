// @language-lab/memory
// Four memory types per blueprint: Profile, Knowledge, Error, Episodic.
// No vector database - all structured data in SQLite, read/written over IPC.
//
// Training atomically writes a lesson contribution with its checkpoint. The
// cross-lesson projection replaces each lesson rather than counting retries.
export * from "./learning";

export interface ProfileMemory {
  readonly targetLanguage: string;
  readonly level: string;
  readonly goals: readonly string[];
  readonly source?: "default" | "self_reported";
}

export interface KnowledgeMemoryItem {
  readonly item: string;
  readonly mastery: "new" | "learning" | "familiar" | "mastered";
  readonly practiceTurns?: number;
  readonly guidedTurns?: number;
  readonly freeTurns?: number;
}

export interface ErrorMemoryItem {
  readonly pattern: string;
  readonly count: number;
  readonly lastSeen: string;
  readonly guidedCount?: number;
  readonly modelCount?: number;
}

export interface EpisodicMemoryItem {
  readonly summary: string;
  readonly at: string;
  readonly mode?: "demo" | "ai";
  readonly completed?: boolean;
}

export interface MemorySnapshot {
  readonly profile: ProfileMemory;
  readonly knowledge: readonly KnowledgeMemoryItem[];
  readonly errors: readonly ErrorMemoryItem[];
  readonly episodes: readonly EpisodicMemoryItem[];
}

// @language-lab/memory
// Four memory types per blueprint: Profile, Knowledge, Error, Episodic.
// No vector database - all structured data in SQLite, read/written over IPC.
//
// The snapshot below is the in-webview view passed into SkillContext; writes
// are batched per conversation turn (single transaction, not per event).

export interface ProfileMemory {
  readonly targetLanguage: string;
  readonly level: string;
  readonly goals: readonly string[];
}

export interface KnowledgeMemoryItem {
  readonly item: string;
  readonly mastery: "new" | "learning" | "familiar" | "mastered";
}

export interface ErrorMemoryItem {
  readonly pattern: string;
  readonly count: number;
  readonly lastSeen: string;
}

export interface EpisodicMemoryItem {
  readonly summary: string;
  readonly at: string;
}

export interface MemorySnapshot {
  readonly profile: ProfileMemory;
  readonly knowledge: readonly KnowledgeMemoryItem[];
  readonly errors: readonly ErrorMemoryItem[];
  readonly episodes: readonly EpisodicMemoryItem[];
}

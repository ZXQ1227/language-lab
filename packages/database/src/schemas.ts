// Zod schemas validating every row that crosses the IPC boundary.
// Repositories parse Rust-side query results through these before returning
// them to business code, so malformed data fails loudly at the boundary.

import { z } from "zod";

const int = z.number().int();
const timestamp = int; // unix milliseconds

export const userRow = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type UserRow = z.infer<typeof userRow>;

export const studentProfileRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  targetLanguage: z.string(),
  level: z.string(),
  goals: z.string(), // JSON string
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StudentProfileRow = z.infer<typeof studentProfileRow>;

export const scenarioRow = z.object({
  id: z.string().min(1),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  difficulty: z.string(),
  objectives: z.string(), // JSON string
  targetVocabulary: z.string(), // JSON string
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ScenarioRow = z.infer<typeof scenarioRow>;

export const lessonRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  scenarioId: z.string(),
  status: z.enum(["planned", "active", "completed"]),
  difficultyOverride: z.string().nullable(),
  startedAt: timestamp.nullable(),
  completedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type LessonRow = z.infer<typeof lessonRow>;

export const conversationRow = z.object({
  id: z.string().min(1),
  lessonId: z.string(),
  mode: z.enum(["text", "voice"]),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ConversationRow = z.infer<typeof conversationRow>;

export const messageRow = z.object({
  id: z.string().min(1),
  conversationId: z.string(),
  seq: int,
  role: z.enum(["student", "tutor", "system"]),
  content: z.string(),
  confidence: z.number().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type MessageRow = z.infer<typeof messageRow>;

export const learningEventRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  lessonId: z.string().nullable(),
  type: z.string(),
  payload: z.string(), // JSON string
  occurredAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type LearningEventRow = z.infer<typeof learningEventRow>;

export const knowledgeItemRow = z.object({
  id: z.string().min(1),
  kind: z.enum(["vocab", "grammar", "expression"]),
  text: z.string(),
  language: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type KnowledgeItemRow = z.infer<typeof knowledgeItemRow>;

export const studentKnowledgeRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  knowledgeItemId: z.string(),
  status: z.enum(["new", "learning", "mastered"]),
  mastery: int.max(100),
  lastReviewedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type StudentKnowledgeRow = z.infer<typeof studentKnowledgeRow>;

export const errorRecordRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  lessonId: z.string().nullable(),
  category: z.string(),
  originalText: z.string(),
  correctedText: z.string(),
  explanation: z.string().nullable(),
  count: int,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ErrorRecordRow = z.infer<typeof errorRecordRow>;

export const reviewTaskRow = z.object({
  id: z.string().min(1),
  userId: z.string(),
  type: z.string(),
  payload: z.string(), // JSON string
  dueAt: timestamp,
  status: z.enum(["pending", "done", "skipped"]),
  completedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ReviewTaskRow = z.infer<typeof reviewTaskRow>;

// Drizzle schema for Language Lab.
//
// Build-time only (blueprint v1.1): drizzle-kit turns this into versioned SQL
// migrations executed by the Rust core at startup. Nothing here runs in the
// webview.
//
// Design rules:
// - Template content (scenarios) is separated from learning records
//   (lessons, conversations, learning_events, ...).
// - Every core table carries created_at / updated_at (unix milliseconds).
// - Ids are TEXT (uuid) generated client-side; timestamps are INTEGER unix ms.

import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const studentProfiles = sqliteTable(
  "student_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    targetLanguage: text("target_language").notNull().default("en"),
    /** CEFR-ish level set by assessment: e.g. "A2", "B1". */
    level: text("level").notNull().default("A2"),
    /** Free-form learning goals, JSON array of strings. */
    goals: text("goals").notNull().default("[]"),
    ...timestamps,
  },
  (t) => [unique("student_profiles_user_unique").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Template content (product-owned, shipped with the app)
// ---------------------------------------------------------------------------

export const scenarios = sqliteTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(), // travel | dining | accommodation | social
    difficulty: text("difficulty").notNull().default("A2"),
    /** JSON: learning objectives for this scenario. */
    objectives: text("objectives").notNull().default("[]"),
    /** JSON: target vocabulary ids / lemmas. */
    targetVocabulary: text("target_vocabulary").notNull().default("[]"),
    ...timestamps,
  },
  (t) => [unique("scenarios_slug_unique").on(t.slug)],
);

// ---------------------------------------------------------------------------
// Learning records (user-owned, must never be overwritten by upgrades)
// ---------------------------------------------------------------------------

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  scenarioId: text("scenario_id")
    .notNull()
    .references(() => scenarios.id),
  status: text("status").notNull().default("planned"), // planned | active | completed
  difficultyOverride: text("difficulty_override"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  ...timestamps,
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id),
  mode: text("mode").notNull().default("text"), // text | voice
  ...timestamps,
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    seq: integer("seq").notNull(), // ordering within the conversation
    role: text("role").notNull(), // student | tutor | system
    content: text("content").notNull(),
    /** ASR confidence when the message came from speech (0..1). */
    confidence: real("confidence"),
    ...timestamps,
  },
  (t) => [unique("messages_conversation_seq_unique").on(t.conversationId, t.seq)],
);

export const learningEvents = sqliteTable("learning_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: text("lesson_id").references(() => lessons.id),
  /** Event type, e.g. "vocabulary_used", "error_made", "task_completed". */
  type: text("type").notNull(),
  /** JSON payload with event-specific fields. */
  payload: text("payload").notNull().default("{}"),
  occurredAt: integer("occurred_at").notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Memory tables (knowledge, errors, review)
// ---------------------------------------------------------------------------

export const knowledgeItems = sqliteTable(
  "knowledge_items",
  {
    id: text("id").primaryKey(),
    /** vocab | grammar | expression */
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    language: text("language").notNull().default("en"),
    ...timestamps,
  },
  (t) => [unique("knowledge_items_unique").on(t.kind, t.text, t.language)],
);

export const studentKnowledge = sqliteTable(
  "student_knowledge",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    knowledgeItemId: text("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItems.id),
    status: text("status").notNull().default("new"), // new | learning | mastered
    mastery: integer("mastery").notNull().default(0), // 0..100
    lastReviewedAt: integer("last_reviewed_at"),
    ...timestamps,
  },
  (t) => [unique("student_knowledge_unique").on(t.userId, t.knowledgeItemId)],
);

export const errorRecords = sqliteTable("error_records", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: text("lesson_id").references(() => lessons.id),
  /** Diagnostic category, e.g. "articles", "tense", "word_choice". */
  category: text("category").notNull(),
  originalText: text("original_text").notNull(),
  correctedText: text("corrected_text").notNull(),
  explanation: text("explanation"),
  /** How often this error pattern has recurred. */
  count: integer("count").notNull().default(1),
  ...timestamps,
});

export const reviewTasks = sqliteTable("review_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  /** Task type, e.g. "review_error", "practice_vocabulary". */
  type: text("type").notNull(),
  /** JSON payload with task-specific fields. */
  payload: text("payload").notNull().default("{}"),
  dueAt: integer("due_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | skipped
  completedAt: integer("completed_at"),
  ...timestamps,
});

// Repository layer: the ONLY place where SQL strings exist outside the Rust
// core. Business code never writes SQL; it calls repositories, which return
// Zod-validated, camelCase rows.

import type { z } from "zod";
import type { DbRow, DbTransport } from "./transport";
import * as S from "./schemas";

export function newId(): string {
  return crypto.randomUUID();
}

export function nowMs(): number {
  return Date.now();
}

/** Converts a raw IPC row (snake_case SQL columns) into camelCase. */
function mapRow(row: DbRow): DbRow {
  const out: DbRow = {};
  for (const key of Object.keys(row)) {
    out[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = row[key];
  }
  return out;
}

function parse<T>(schema: z.ZodType<T>, rows: DbRow[]): T[] {
  return rows.map((r) => schema.parse(mapRow(r)));
}

abstract class BaseRepo {
  constructor(protected readonly db: DbTransport) {}
}

export class UsersRepo extends BaseRepo {
  async ensureLocalLearner(): Promise<void> {
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
      ["local-training-user", "Local learner", ts],
    );
  }
  async create(input: { id?: string; displayName: string }): Promise<S.UserRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
      [id, input.displayName, ts],
    );
    return this.requireById(id);
  }

  async findById(id: string): Promise<S.UserRow | null> {
    const rows = parse(S.userRow, await this.db.select("SELECT * FROM users WHERE id = ?1", [id]));
    return rows[0] ?? null;
  }

  private async requireById(id: string): Promise<S.UserRow> {
    const user = await this.findById(id);
    if (!user) throw new Error(`user not found: ${id}`);
    return user;
  }
}

export class StudentProfilesRepo extends BaseRepo {
  async create(input: {
    id?: string;
    userId: string;
    targetLanguage?: string;
    level?: string;
    goals?: string[];
  }): Promise<S.StudentProfileRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO student_profiles (id, user_id, target_language, level, goals, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
      [
        id,
        input.userId,
        input.targetLanguage ?? "en",
        input.level ?? "A2",
        JSON.stringify(input.goals ?? []),
        ts,
      ],
    );
    const rows = parse(
      S.studentProfileRow,
      await this.db.select("SELECT * FROM student_profiles WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async findByUserId(userId: string): Promise<S.StudentProfileRow | null> {
    const rows = parse(
      S.studentProfileRow,
      await this.db.select("SELECT * FROM student_profiles WHERE user_id = ?1", [userId]),
    );
    return rows[0] ?? null;
  }

  async update(id: string, patch: { level?: string; goals?: string[] }): Promise<void> {
    const ts = nowMs();
    if (patch.level !== undefined) {
      await this.db.execute(
        "UPDATE student_profiles SET level = ?1, updated_at = ?2 WHERE id = ?3",
        [patch.level, ts, id],
      );
    }
    if (patch.goals !== undefined) {
      await this.db.execute(
        "UPDATE student_profiles SET goals = ?1, updated_at = ?2 WHERE id = ?3",
        [JSON.stringify(patch.goals), ts, id],
      );
    }
  }
}

export class ScenariosRepo extends BaseRepo {
  /** Upsert for template content shipped with the app. */
  async upsert(input: {
    id: string;
    slug: string;
    title: string;
    category: string;
    difficulty?: string;
    objectives?: string[];
    targetVocabulary?: string[];
  }): Promise<void> {
    const ts = nowMs();
    await this.db.execute(
      `INSERT INTO scenarios (id, slug, title, category, difficulty, objectives, target_vocabulary, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title, category = excluded.category, difficulty = excluded.difficulty,
         objectives = excluded.objectives, target_vocabulary = excluded.target_vocabulary,
         updated_at = excluded.updated_at`,
      [
        input.id,
        input.slug,
        input.title,
        input.category,
        input.difficulty ?? "A2",
        JSON.stringify(input.objectives ?? []),
        JSON.stringify(input.targetVocabulary ?? []),
        ts,
      ],
    );
  }

  async findBySlug(slug: string): Promise<S.ScenarioRow | null> {
    const rows = parse(
      S.scenarioRow,
      await this.db.select("SELECT * FROM scenarios WHERE slug = ?1", [slug]),
    );
    return rows[0] ?? null;
  }

  async list(): Promise<S.ScenarioRow[]> {
    return parse(
      S.scenarioRow,
      await this.db.select("SELECT * FROM scenarios ORDER BY category, difficulty"),
    );
  }
}

export class LessonsRepo extends BaseRepo {
  async create(input: {
    id?: string;
    userId: string;
    scenarioId: string;
    difficultyOverride?: string;
  }): Promise<S.LessonRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO lessons (id, user_id, scenario_id, status, difficulty_override, started_at, created_at, updated_at) VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?5, ?5)",
      [id, input.userId, input.scenarioId, input.difficultyOverride ?? null, ts],
    );
    const rows = parse(
      S.lessonRow,
      await this.db.select("SELECT * FROM lessons WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async findById(id: string): Promise<S.LessonRow | null> {
    const rows = parse(
      S.lessonRow,
      await this.db.select("SELECT * FROM lessons WHERE id = ?1", [id]),
    );
    return rows[0] ?? null;
  }

  async listByUser(userId: string): Promise<S.LessonRow[]> {
    return parse(
      S.lessonRow,
      await this.db.select("SELECT * FROM lessons WHERE user_id = ?1 ORDER BY created_at DESC", [
        userId,
      ]),
    );
  }

  async setStatus(id: string, status: S.LessonRow["status"]): Promise<void> {
    const ts = nowMs();
    const completedAt = status === "completed" ? ts : null;
    await this.db.execute(
      "UPDATE lessons SET status = ?1, completed_at = COALESCE(?2, completed_at), updated_at = ?3 WHERE id = ?4",
      [status, completedAt, ts, id],
    );
  }
}

export class ConversationsRepo extends BaseRepo {
  async create(input: {
    id?: string;
    lessonId: string;
    mode?: "text" | "voice";
  }): Promise<S.ConversationRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO conversations (id, lesson_id, mode, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
      [id, input.lessonId, input.mode ?? "text", ts],
    );
    const rows = parse(
      S.conversationRow,
      await this.db.select("SELECT * FROM conversations WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async listByLesson(lessonId: string): Promise<S.ConversationRow[]> {
    return parse(
      S.conversationRow,
      await this.db.select("SELECT * FROM conversations WHERE lesson_id = ?1 ORDER BY created_at", [
        lessonId,
      ]),
    );
  }
}

export class MessagesRepo extends BaseRepo {
  async append(input: {
    id?: string;
    conversationId: string;
    role: S.MessageRow["role"];
    content: string;
    confidence?: number;
  }): Promise<S.MessageRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    const next = await this.db.select(
      "SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM messages WHERE conversation_id = ?1",
      [input.conversationId],
    );
    const seq = Number((next[0]?.next_seq as number | undefined) ?? 0);
    await this.db.execute(
      "INSERT INTO messages (id, conversation_id, seq, role, content, confidence, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
      [id, input.conversationId, seq, input.role, input.content, input.confidence ?? null, ts],
    );
    await this.db.execute("UPDATE conversations SET updated_at = ?1 WHERE id = ?2", [
      ts,
      input.conversationId,
    ]);
    const rows = parse(
      S.messageRow,
      await this.db.select("SELECT * FROM messages WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async listByConversation(conversationId: string): Promise<S.MessageRow[]> {
    return parse(
      S.messageRow,
      await this.db.select("SELECT * FROM messages WHERE conversation_id = ?1 ORDER BY seq", [
        conversationId,
      ]),
    );
  }
}

export class LearningEventsRepo extends BaseRepo {
  /** One atomic checkpoint contains the transcript, evidence, events and state. */
  async saveTrainingCheckpoint(input: {
    id: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const ts = nowMs();
    await this.db.execute(
      `INSERT INTO learning_events (id, user_id, lesson_id, type, payload, occurred_at, created_at, updated_at)
       VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, occurred_at = excluded.occurred_at, updated_at = excluded.updated_at`,
      [
        `training-${input.id}`,
        "local-training-user",
        "training_checkpoint",
        JSON.stringify(input.payload),
        ts,
      ],
    );
  }

  async listTrainingCheckpoints(): Promise<S.LearningEventRow[]> {
    return parse(
      S.learningEventRow,
      await this.db.select(
        "SELECT * FROM learning_events WHERE user_id = ?1 AND type = ?2 ORDER BY updated_at DESC LIMIT ?3",
        ["local-training-user", "training_checkpoint", 50],
      ),
    );
  }
  async record(input: {
    id?: string;
    userId: string;
    lessonId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
    occurredAt?: number;
  }): Promise<S.LearningEventRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO learning_events (id, user_id, lesson_id, type, payload, occurred_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
      [
        id,
        input.userId,
        input.lessonId ?? null,
        input.type,
        JSON.stringify(input.payload ?? {}),
        input.occurredAt ?? ts,
        ts,
      ],
    );
    const rows = parse(
      S.learningEventRow,
      await this.db.select("SELECT * FROM learning_events WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async listByUser(userId: string, limit = 100): Promise<S.LearningEventRow[]> {
    return parse(
      S.learningEventRow,
      await this.db.select(
        "SELECT * FROM learning_events WHERE user_id = ?1 ORDER BY occurred_at DESC LIMIT ?2",
        [userId, limit],
      ),
    );
  }
}

export class KnowledgeItemsRepo extends BaseRepo {
  async upsert(input: {
    id: string;
    kind: S.KnowledgeItemRow["kind"];
    text: string;
    language?: string;
  }): Promise<S.KnowledgeItemRow> {
    const ts = nowMs();
    await this.db.execute(
      `INSERT INTO knowledge_items (id, kind, text, language, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(kind, text, language) DO UPDATE SET updated_at = excluded.updated_at`,
      [input.id, input.kind, input.text, input.language ?? "en", ts],
    );
    const rows = parse(
      S.knowledgeItemRow,
      await this.db.select(
        "SELECT * FROM knowledge_items WHERE kind = ?1 AND text = ?2 AND language = ?3",
        [input.kind, input.text, input.language ?? "en"],
      ),
    );
    return rows[0]!;
  }
}

export class StudentKnowledgeRepo extends BaseRepo {
  async upsert(input: {
    id?: string;
    userId: string;
    knowledgeItemId: string;
    status?: S.StudentKnowledgeRow["status"];
    mastery?: number;
  }): Promise<S.StudentKnowledgeRow> {
    const ts = nowMs();
    await this.db.execute(
      `INSERT INTO student_knowledge (id, user_id, knowledge_item_id, status, mastery, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(user_id, knowledge_item_id) DO UPDATE SET
         status = excluded.status, mastery = excluded.mastery, updated_at = excluded.updated_at`,
      [
        input.id ?? newId(),
        input.userId,
        input.knowledgeItemId,
        input.status ?? "new",
        input.mastery ?? 0,
        ts,
      ],
    );
    const rows = parse(
      S.studentKnowledgeRow,
      await this.db.select(
        "SELECT * FROM student_knowledge WHERE user_id = ?1 AND knowledge_item_id = ?2",
        [input.userId, input.knowledgeItemId],
      ),
    );
    return rows[0]!;
  }

  async listByUser(userId: string): Promise<S.StudentKnowledgeRow[]> {
    return parse(
      S.studentKnowledgeRow,
      await this.db.select("SELECT * FROM student_knowledge WHERE user_id = ?1", [userId]),
    );
  }
}

export class ErrorRecordsRepo extends BaseRepo {
  async record(input: {
    id?: string;
    userId: string;
    lessonId?: string | null;
    category: string;
    originalText: string;
    correctedText: string;
    explanation?: string;
  }): Promise<S.ErrorRecordRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO error_records (id, user_id, lesson_id, category, original_text, corrected_text, explanation, count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
      [
        id,
        input.userId,
        input.lessonId ?? null,
        input.category,
        input.originalText,
        input.correctedText,
        input.explanation ?? null,
        ts,
      ],
    );
    const rows = parse(
      S.errorRecordRow,
      await this.db.select("SELECT * FROM error_records WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async listByUser(userId: string): Promise<S.ErrorRecordRow[]> {
    return parse(
      S.errorRecordRow,
      await this.db.select(
        "SELECT * FROM error_records WHERE user_id = ?1 ORDER BY updated_at DESC",
        [userId],
      ),
    );
  }
}

export class ReviewTasksRepo extends BaseRepo {
  async create(input: {
    id?: string;
    userId: string;
    type: string;
    payload?: Record<string, unknown>;
    dueAt: number;
  }): Promise<S.ReviewTaskRow> {
    const id = input.id ?? newId();
    const ts = nowMs();
    await this.db.execute(
      "INSERT INTO review_tasks (id, user_id, type, payload, due_at, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)",
      [id, input.userId, input.type, JSON.stringify(input.payload ?? {}), input.dueAt, ts],
    );
    const rows = parse(
      S.reviewTaskRow,
      await this.db.select("SELECT * FROM review_tasks WHERE id = ?1", [id]),
    );
    return rows[0]!;
  }

  async listDue(userId: string, atMs = nowMs()): Promise<S.ReviewTaskRow[]> {
    return parse(
      S.reviewTaskRow,
      await this.db.select(
        "SELECT * FROM review_tasks WHERE user_id = ?1 AND status = 'pending' AND due_at <= ?2 ORDER BY due_at",
        [userId, atMs],
      ),
    );
  }

  async setStatus(id: string, status: S.ReviewTaskRow["status"]): Promise<void> {
    const ts = nowMs();
    await this.db.execute(
      "UPDATE review_tasks SET status = ?1, completed_at = ?2, updated_at = ?2 WHERE id = ?4",
      [status, status === "pending" ? null : ts, ts, id],
    );
  }
}

/** All repositories sharing one transport. */
export interface Repositories {
  users: UsersRepo;
  profiles: StudentProfilesRepo;
  scenarios: ScenariosRepo;
  lessons: LessonsRepo;
  conversations: ConversationsRepo;
  messages: MessagesRepo;
  learningEvents: LearningEventsRepo;
  knowledgeItems: KnowledgeItemsRepo;
  studentKnowledge: StudentKnowledgeRepo;
  errorRecords: ErrorRecordsRepo;
  reviewTasks: ReviewTasksRepo;
}

export function createRepositories(db: DbTransport): Repositories {
  return {
    users: new UsersRepo(db),
    profiles: new StudentProfilesRepo(db),
    scenarios: new ScenariosRepo(db),
    lessons: new LessonsRepo(db),
    conversations: new ConversationsRepo(db),
    messages: new MessagesRepo(db),
    learningEvents: new LearningEventsRepo(db),
    knowledgeItems: new KnowledgeItemsRepo(db),
    studentKnowledge: new StudentKnowledgeRepo(db),
    errorRecords: new ErrorRecordsRepo(db),
    reviewTasks: new ReviewTasksRepo(db),
  };
}

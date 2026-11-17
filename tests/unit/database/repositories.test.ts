// Repository layer unit tests. The SQL itself lives in the Rust core in
// production; here we pin down the TS-side contract: correct statements and
// params are issued, snake_case rows are mapped to camelCase, and every row
// is validated by its Zod schema before it escapes the layer.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationsRepo,
  LessonsRepo,
  LearningEventsRepo,
  MessagesRepo,
  ReviewTasksRepo,
  ScenariosRepo,
  StudentProfilesRepo,
  UsersRepo,
} from "@language-lab/database";
import { InMemoryTransport } from "./in-memory-transport";

let db: InMemoryTransport;

beforeEach(() => {
  db = new InMemoryTransport();
});

describe("UsersRepo", () => {
  it("creates a user and finds it back with camelCase fields", async () => {
    const repo = new UsersRepo(db);
    const user = await repo.create({ displayName: "Student", id: "user-1" });
    expect(user).toEqual({
      id: "user-1",
      displayName: "Student",
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    });
    expect(user.createdAt).toBeGreaterThan(0);
    await expect(repo.findById("user-1")).resolves.toEqual(user);
  });

  it("generates a uuid id when none is given", async () => {
    const repo = new UsersRepo(db);
    const user = await repo.create({ displayName: "A" });
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns null for a missing user", async () => {
    const repo = new UsersRepo(db);
    await expect(repo.findById("nope")).resolves.toBeNull();
  });
});

describe("StudentProfilesRepo", () => {
  it("applies defaults and round-trips through the row schema", async () => {
    await new UsersRepo(db).create({ id: "user-1", displayName: "Student" });
    const repo = new StudentProfilesRepo(db);
    const profile = await repo.create({ userId: "user-1", goals: ["travel english"] });
    expect(profile.targetLanguage).toBe("en");
    expect(profile.level).toBe("A2");
    expect(JSON.parse(profile.goals)).toEqual(["travel english"]);
    await expect(repo.findByUserId("user-1")).resolves.toEqual(profile);
    await expect(repo.findByUserId("missing")).resolves.toBeNull();
  });

  it("updates level and goals independently", async () => {
    await new UsersRepo(db).create({ id: "user-1", displayName: "Student" });
    const repo = new StudentProfilesRepo(db);
    const profile = await repo.create({ userId: "user-1" });
    await repo.update(profile.id, { level: "B1" });
    const updated = await repo.findByUserId("user-1");
    expect(updated?.level).toBe("B1");
    expect(JSON.parse(updated!.goals)).toEqual([]);

    await repo.update(profile.id, { goals: ["work email"] });
    const afterGoals = await repo.findByUserId("user-1");
    expect(JSON.parse(afterGoals!.goals)).toEqual(["work email"]);
    expect(afterGoals!.level).toBe("B1");
  });
});

describe("ScenariosRepo", () => {
  it("upserts by slug: second call updates instead of duplicating", async () => {
    const repo = new ScenariosRepo(db);
    await repo.upsert({
      id: "sc-1",
      slug: "cafe-order",
      title: "Ordering at a cafe",
      category: "daily",
      targetVocabulary: ["latte"],
    });
    await repo.upsert({
      id: "sc-1",
      slug: "cafe-order",
      title: "Ordering at a cafe (v2)",
      category: "daily",
    });
    const rows = await repo.list();
    expect(rows).toHaveLength(1);
    const row = await repo.findBySlug("cafe-order");
    expect(row?.title).toBe("Ordering at a cafe (v2)");
    // Fields not re-supplied are overwritten with defaults by the upsert.
    expect(JSON.parse(row!.targetVocabulary)).toEqual([]);
    expect(JSON.parse(row!.objectives)).toEqual([]);
    expect(await repo.findBySlug("missing")).toBeNull();
  });
});

describe("LessonsRepo", () => {
  it("creates an active lesson with null override", async () => {
    const repo = new LessonsRepo(db);
    const lesson = await repo.create({ id: "lesson-1", userId: "u", scenarioId: "sc" });
    expect(lesson.status).toBe("active");
    expect(lesson.difficultyOverride).toBeNull();
    expect(lesson.completedAt).toBeNull();
  });

  it("keeps completed_at once completed (COALESCE keeps history)", async () => {
    const repo = new LessonsRepo(db);
    await repo.create({ id: "lesson-1", userId: "u", scenarioId: "sc" });
    await repo.setStatus("lesson-1", "completed");
    const completed = await repo.findById("lesson-1");
    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).not.toBeNull();

    await repo.setStatus("lesson-1", "active");
    const reopened = await repo.findById("lesson-1");
    expect(reopened?.status).toBe("active");
    expect(reopened?.completedAt).not.toBeNull();
  });

  it("lists lessons of a user newest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const repo = new LessonsRepo(db);
    await repo.create({ id: "l1", userId: "u", scenarioId: "sc" });
    vi.setSystemTime(2_000);
    await repo.create({ id: "l2", userId: "u", scenarioId: "sc" });
    const rows = await repo.listByUser("u");
    expect(rows.map((r) => r.id)).toEqual(["l2", "l1"]);
    vi.useRealTimers();
  });
});

describe("ConversationsRepo + MessagesRepo", () => {
  it("assigns monotonically increasing seq per conversation", async () => {
    const conversations = new ConversationsRepo(db);
    const messages = new MessagesRepo(db);
    const conversation = await conversations.create({ id: "c1", lessonId: "l1" });
    const m0 = await messages.append({
      conversationId: conversation.id,
      role: "student",
      content: "hello",
    });
    const m1 = await messages.append({
      conversationId: conversation.id,
      role: "tutor",
      content: "hi!",
      confidence: 0.9,
    });
    expect(m0.seq).toBe(0);
    expect(m1.seq).toBe(1);
    expect(m1.confidence).toBeCloseTo(0.9);

    const listed = await messages.listByConversation("c1");
    expect(listed.map((m) => m.seq)).toEqual([0, 1]);
  });

  it("starts seq at 0 for a fresh conversation and lists per conversation", async () => {
    const conversations = new ConversationsRepo(db);
    const messages = new MessagesRepo(db);
    const a = await conversations.create({ id: "a", lessonId: "l" });
    const b = await conversations.create({ id: "b", lessonId: "l", mode: "voice" });
    await messages.append({ conversationId: b.id, role: "student", content: "b1" });
    const first = await messages.append({ conversationId: a.id, role: "student", content: "a1" });
    expect(first.seq).toBe(0);
    expect(await conversations.listByLesson("l")).toHaveLength(2);
  });
});

describe("LearningEventsRepo", () => {
  it("serializes payload to JSON and lists newest first with limit", async () => {
    const repo = new LearningEventsRepo(db);
    const e1 = await repo.record({
      id: "e1",
      userId: "u",
      type: "vocabulary_used",
      payload: { word: "latte" },
      occurredAt: 100,
    });
    expect(e1.occurredAt).toBe(100);
    await repo.record({ id: "e2", userId: "u", type: "hint_requested", occurredAt: 200 });
    await repo.record({ id: "e3", userId: "u", type: "error_made", occurredAt: 300 });

    const rows = await repo.listByUser("u", 2);
    expect(rows.map((r) => r.id)).toEqual(["e3", "e2"]);
    expect(JSON.parse(rows[0]!.payload as string)).toEqual({});
  });
});

describe("ReviewTasksRepo", () => {
  it("lists only pending tasks that are due", async () => {
    const repo = new ReviewTasksRepo(db);
    await repo.create({ id: "t1", userId: "u", type: "vocab", dueAt: 100 });
    await repo.create({ id: "t2", userId: "u", type: "vocab", dueAt: 150 });
    await repo.create({ id: "t3", userId: "u", type: "vocab", dueAt: 999 });

    const due = await repo.listDue("u", 150);
    expect(due.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(due.every((t) => t.status === "pending")).toBe(true);
  });

  it("completed tasks leave the due list", async () => {
    const repo = new ReviewTasksRepo(db);
    await repo.create({ id: "t1", userId: "u", type: "vocab", dueAt: 100 });
    await repo.setStatus("t1", "done");
    await expect(repo.listDue("u", 150)).resolves.toEqual([]);
  });
});

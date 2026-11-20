import { afterEach, describe, expect, it } from "vitest";
import { createRepositories } from "@language-lab/database";
import { readLearningProfile, writeLearningProfile } from "@language-lab/memory";
import { createTrainingSession } from "../../../apps/desktop/src/training/session";
import { buildLearningContribution } from "../../../apps/desktop/src/training/learningMemory";
import {
  readLearningMemory,
  readMemoryReuse,
} from "../../../apps/desktop/src/training/learningMemoryPersistence";
import { loadScenarioContent } from "../../../apps/desktop/src/content/scenarioContent";
import {
  buildFreeConversationContribution,
  freeConversationCheckpointSchema,
} from "../../../apps/desktop/src/conversation/checkpoint";
import { createMockGateway } from "@language-lab/model-gateway";
import { createNativeTestDatabase, nativeSqliteAvailable } from "./native-sqlite";

const opened: ReturnType<typeof createNativeTestDatabase>[] = [];
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});
function setup() {
  const database = createNativeTestDatabase();
  opened.push(database);
  return { ...database, repos: createRepositories(database.db) };
}
const hotel = loadScenarioContent().find((course) => course.slug === "hotel-checkin")!;

describe.skipIf(!nativeSqliteAvailable)("learning memory on real SQLite", () => {
  it("retains local preference and atomically deletes the exact source, memory and review rows", async () => {
    const { repos, sql } = setup();
    await repos.users.ensureLocalLearner();
    expect(await readMemoryReuse(repos)).toBe(true);
    await repos.learningEvents.saveMemorySettings({ version: 1, reuseAcrossSessions: false });
    expect(await readMemoryReuse(repos)).toBe(false);
    await repos.learningEvents.saveTrainingCheckpoint({
      id: "remove-me",
      payload: {},
      memory: {},
      reviewPlan: {},
    });
    await repos.learningEvents.saveTrainingCheckpoint({
      id: "keep-me",
      payload: {},
      memory: {},
      reviewPlan: {},
    });
    const ids = () => sql.prepare("SELECT id FROM learning_events ORDER BY id").all();
    const all = ids();
    sql.exec(
      "CREATE TRIGGER fail_source_delete BEFORE DELETE ON learning_events WHEN OLD.type = 'targeted_review_plan' BEGIN SELECT RAISE(ABORT, 'source delete failed'); END",
    );
    await expect(
      repos.learningEvents.deletePracticeSource("remove-me", "training"),
    ).rejects.toThrow("source delete failed");
    expect(ids()).toEqual(all);
    sql.exec("DROP TRIGGER fail_source_delete");
    await repos.learningEvents.deletePracticeSource("remove-me", "training");
    await repos.learningEvents.deletePracticeSource("remove-me", "training");
    expect(ids()).toEqual(all.filter((row) => !String(row.id).endsWith("-remove-me")));
  });

  it("writes a free conversation and its learning observations together", async () => {
    const { repos, sql } = setup();
    await repos.users.ensureLocalLearner();
    const checkpoint = freeConversationCheckpointSchema.parse({
      version: 1,
      id: "free-11111111-1111-4111-8111-111111111111",
      updatedAt: Date.now(),
      turns: [
        {
          utterance: "I watched a heron catch a fish.",
          reply: "Where was that?",
          vocabulary: ["heron"],
        },
      ],
    });
    expect(
      freeConversationCheckpointSchema.safeParse({
        ...checkpoint,
        turns: [{ ...checkpoint.turns[0], vocabulary: ["penguin"] }],
      }).success,
    ).toBe(false);
    const memory = buildFreeConversationContribution(checkpoint);
    const save = () =>
      repos.learningEvents.saveFreeConversationCheckpoint({
        id: checkpoint.id,
        payload: checkpoint,
        memory,
      });
    sql.exec(
      "CREATE TRIGGER fail_chat_memory BEFORE INSERT ON learning_events WHEN NEW.type = 'free_conversation_memory' BEGIN SELECT RAISE(ABORT, 'chat memory failed'); END",
    );
    await expect(save()).rejects.toThrow("chat memory failed");
    expect(await repos.learningEvents.findFreeConversationCheckpoint(checkpoint.id)).toBeNull();
    expect((await readLearningMemory(repos)).document.episodes).toEqual([]);
    sql.exec("DROP TRIGGER fail_chat_memory");
    await save();
    await save();
    expect(
      JSON.parse(
        (await repos.learningEvents.findFreeConversationCheckpoint(checkpoint.id))!.payload,
      ),
    ).toEqual(checkpoint);
    const { document } = await readLearningMemory(repos);
    expect(document.episodes).toEqual([
      expect.objectContaining({ source: "free-conversation", practiceTurns: 1 }),
    ]);
    expect(document.knowledge).toEqual([
      expect.objectContaining({ item: "heron", practiceTurns: 1 }),
    ]);
    expect(await repos.learningEvents.listTrainingCheckpoints()).toEqual([]);
  });

  it("rolls back both checkpoint and memory when the memory row fails, then retries once", async () => {
    const { repos, sql } = setup();
    await repos.users.ensureLocalLearner();
    await repos.learningEvents.saveTrainingCheckpoint({
      id: "atomic",
      payload: { turn: 0 },
      memory: { practice: 0 },
    });
    sql.exec(
      "CREATE TRIGGER fail_memory BEFORE UPDATE ON learning_events WHEN OLD.type = 'learning_memory_contribution' BEGIN SELECT RAISE(ABORT, 'memory write failed'); END",
    );
    await expect(
      repos.learningEvents.saveTrainingCheckpoint({
        id: "atomic",
        payload: { turn: 1 },
        memory: { practice: 1 },
      }),
    ).rejects.toThrow("memory write failed");
    expect(
      JSON.parse((await repos.learningEvents.findTrainingCheckpoint("atomic"))!.payload),
    ).toEqual({ turn: 0 });
    expect(
      JSON.parse(
        (await repos.learningEvents.listMemoryContributions("local-training-user"))[0]!.payload,
      ),
    ).toEqual({ practice: 0 });
    sql.exec("DROP TRIGGER fail_memory");
    await repos.learningEvents.saveTrainingCheckpoint({
      id: "atomic",
      payload: { turn: 1 },
      memory: { practice: 1 },
    });
    expect(await repos.learningEvents.listTrainingCheckpoints()).toHaveLength(1);
    expect(await repos.learningEvents.listMemoryContributions("local-training-user")).toHaveLength(
      1,
    );
    expect(
      JSON.parse((await repos.learningEvents.findTrainingCheckpoint("atomic"))!.payload),
    ).toEqual({ turn: 1 });
  });

  it("writes a profile atomically and reads an existing profile without inventing assessment", async () => {
    const { repos, sql } = setup();
    await repos.users.ensureLocalLearner();
    expect((await readLearningProfile(repos, "local-training-user")).saved).toBe(false);
    const original = { targetLanguage: "en", level: "B1", goals: ["Travel conversations"] };
    await writeLearningProfile(repos, "local-training-user", original);
    const rowId = (await repos.profiles.findByUserId("local-training-user"))!.id;
    sql.exec(
      "CREATE TRIGGER fail_profile BEFORE UPDATE ON student_profiles BEGIN SELECT RAISE(ABORT, 'profile write failed'); END",
    );
    await expect(
      writeLearningProfile(repos, "local-training-user", {
        targetLanguage: "ja",
        level: "A1",
        goals: ["Everyday Japanese"],
      }),
    ).rejects.toThrow("profile write failed");
    expect((await readLearningProfile(repos, "local-training-user")).profile).toEqual(original);
    sql.exec("DROP TRIGGER fail_profile");
    await writeLearningProfile(repos, "local-training-user", { ...original, level: "B2" });
    expect((await repos.profiles.findByUserId("local-training-user"))!.id).toBe(rowId);
    await expect(
      writeLearningProfile(repos, "local-training-user", { ...original, level: "D1" }),
    ).rejects.toThrow();
    expect((await readLearningProfile(repos, "local-training-user")).profile.level).toBe("B2");
  });

  it("paginates beyond the resume window, reads old sources and excludes another learner", async () => {
    const { repos } = setup();
    await repos.users.ensureLocalLearner();
    const template = await createTrainingSession(hotel, { mode: "demo" }, createMockGateway());
    for (let index = 0; index < 105; index++) {
      const id = `lesson-${String(index).padStart(3, "0")}`;
      const session = {
        ...template,
        id,
        state: { ...template.state, lessonId: id },
        learningMemory: undefined,
      };
      const memory = buildLearningContribution(session);
      await repos.learningEvents.saveTrainingCheckpoint({
        id,
        payload: { ...session, learningMemory: memory },
        memory,
      });
    }
    const id = "legacy-source";
    await repos.learningEvents.saveTrainingCheckpoint({
      id,
      payload: {
        ...template,
        id,
        state: { ...template.state, lessonId: id },
        learningMemory: undefined,
      },
    });
    await repos.users.create({ id: "another-user", displayName: "Another learner" });
    await repos.learningEvents.record({
      id: "memory-other",
      userId: "another-user",
      type: "learning_memory_contribution",
      payload: { intentionally: "not our learner's data" },
    });
    const loaded = await readLearningMemory(repos);
    expect(loaded.document.episodes).toHaveLength(106);
    expect(loaded.document.knowledge.find((item) => item.item === "reservation")?.lessonCount).toBe(
      106,
    );
    expect(await repos.learningEvents.listTrainingCheckpoints()).toHaveLength(50);
    expect(await repos.learningEvents.listMemoryContributions("local-training-user")).toHaveLength(
      100,
    );
    expect(await repos.learningEvents.listLegacyMemorySources("local-training-user")).toHaveLength(
      1,
    );
    expect((await repos.learningEvents.findTrainingCheckpoint("lesson-000"))?.id).toBe(
      "training-lesson-000",
    );
  });
});

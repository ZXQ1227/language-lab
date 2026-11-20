import { describe, expect, it } from "vitest";
import { createRepositories, type DbParam } from "@language-lab/database";
import { InMemoryTransport } from "./in-memory-transport";
import { createNativeTestDatabase, nativeSqliteAvailable } from "./native-sqlite";

class FailingTransport extends InMemoryTransport {
  fail = false;
  override execute(sql: string, params?: DbParam[]) {
    if (this.fail && sql.startsWith("INSERT INTO learning_events"))
      return Promise.reject(new Error("write failed"));
    return super.execute(sql, params);
  }
}

describe("training checkpoints", () => {
  it.skipIf(!nativeSqliteAvailable)(
    "reads older hotel checkpoints across result pages",
    async () => {
      const sqlite = createNativeTestDatabase();
      try {
        const repos = createRepositories(sqlite.db);
        await repos.users.ensureLocalLearner();
        for (let index = 0; index <= 100; index++) {
          await repos.learningEvents.saveTrainingCheckpoint({
            id: `hotel-${String(index).padStart(3, "0")}`,
            payload: { scenario: { slug: "hotel-checkin" } },
          });
        }
        await repos.learningEvents.saveTrainingCheckpoint({
          id: "airport",
          payload: { scenario: { slug: "airport-checkin" } },
        });
        await sqlite.db.execute("UPDATE learning_events SET payload = ?1 WHERE id = ?2", [
          "invalid json",
          "training-airport",
        ]);
        const first = await repos.learningEvents.listHotelTrainingCheckpoints("");
        expect(first).toHaveLength(100);
        expect(first[0]?.id).toBe("training-hotel-000");
        const old = await repos.learningEvents.listHotelTrainingCheckpoints(first[99]!.id);
        expect(old.map(({ id }) => id)).toEqual(["training-hotel-100"]);
      } finally {
        sqlite.close();
      }
    },
  );

  it("keeps one coherent checkpoint per lesson and preserves the previous save on failure", async () => {
    const db = new FailingTransport();
    const repos = createRepositories(db);
    await repos.users.create({ id: "local-training-user", displayName: "My learner" });
    await repos.users.ensureLocalLearner();
    expect((await repos.users.findById("local-training-user"))?.displayName).toBe("My learner");
    const first = { state: { turnCount: 0 }, messages: ["opening"], events: [] };
    await repos.learningEvents.saveTrainingCheckpoint({ id: "lesson", payload: first });
    db.fail = true;
    await expect(
      repos.learningEvents.saveTrainingCheckpoint({
        id: "lesson",
        payload: { state: { turnCount: 1 }, messages: ["opening", "reply"], events: ["passed"] },
      }),
    ).rejects.toThrow("write failed");
    expect(JSON.parse((await repos.learningEvents.listTrainingCheckpoints())[0]!.payload)).toEqual(
      first,
    );
    db.fail = false;
    const next = {
      state: { turnCount: 1 },
      messages: ["opening", "reply", "partner"],
      events: ["passed"],
    };
    await repos.learningEvents.saveTrainingCheckpoint({ id: "lesson", payload: next });
    const checkpoints = await repos.learningEvents.listTrainingCheckpoints();
    expect(checkpoints).toHaveLength(1);
    expect(JSON.parse(checkpoints[0]!.payload)).toEqual(next);
  });
});

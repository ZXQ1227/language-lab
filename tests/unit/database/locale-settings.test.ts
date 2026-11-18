import { describe, expect, it } from "vitest";
import { createRepositories } from "@language-lab/database";
import { createNativeTestDatabase, nativeSqliteAvailable } from "./native-sqlite";

describe.skipIf(!nativeSqliteAvailable)("locale preferences on isolated real SQLite", () => {
  it("upserts one preference, rolls back failures and stays outside learning histories", async () => {
    const { db, sql, close } = createNativeTestDatabase();
    try {
      const repos = createRepositories(db);
      await repos.users.ensureLocalLearner();
      expect(await repos.learningEvents.findLocaleSettings()).toBeNull();
      const original = { version: 1, localeMode: "manual", appLocale: "zh-TW" };
      await repos.learningEvents.saveLocaleSettings(original);
      sql.exec(
        "CREATE TRIGGER fail_locale BEFORE UPDATE ON learning_events WHEN OLD.type = 'locale_settings' BEGIN SELECT RAISE(ABORT, 'locale write failed'); END",
      );
      await expect(
        repos.learningEvents.saveLocaleSettings({ version: 1, localeMode: "system" }),
      ).rejects.toThrow("locale write failed");
      expect(JSON.parse((await repos.learningEvents.findLocaleSettings())!.payload)).toEqual(
        original,
      );
      sql.exec("DROP TRIGGER fail_locale");
      await repos.learningEvents.saveLocaleSettings({ version: 1, localeMode: "system" });
      expect(JSON.parse((await repos.learningEvents.findLocaleSettings())!.payload)).toEqual({
        version: 1,
        localeMode: "system",
      });
      expect(await repos.learningEvents.listTrainingCheckpoints()).toEqual([]);
      expect(await repos.learningEvents.listMemoryContributions("local-training-user")).toEqual([]);
      expect(
        sql
          .prepare("SELECT COUNT(*) AS count FROM learning_events WHERE type = 'locale_settings'")
          .get()!.count,
      ).toBe(1);
    } finally {
      close();
    }
  });
});

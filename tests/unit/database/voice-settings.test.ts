import { describe, expect, it } from "vitest";
import { createRepositories } from "@language-lab/database";
import { defaultSpeechSettings } from "../../../apps/desktop/src/speech/settings";
import { createNativeTestDatabase, nativeSqliteAvailable } from "./native-sqlite";

describe.skipIf(!nativeSqliteAvailable)("speech preferences on real SQLite", () => {
  it("saves a single learner-scoped setting, rolls back a failed update and keeps it outside lesson history", async () => {
    const { db, sql, close } = createNativeTestDatabase();
    try {
      const repos = createRepositories(db);
      await repos.users.ensureLocalLearner();
      const original = defaultSpeechSettings();
      await repos.learningEvents.saveVoiceSettings(original);
      sql.exec(
        "CREATE TRIGGER fail_voice_setting BEFORE UPDATE ON learning_events WHEN OLD.type = 'voice_settings' BEGIN SELECT RAISE(ABORT, 'settings write failed'); END",
      );
      const changed = {
        ...original,
        asr: { ...original.asr, enabled: true, baseUrl: "http://localhost:9191/v1" },
      };
      await expect(repos.learningEvents.saveVoiceSettings(changed)).rejects.toThrow(
        "settings write failed",
      );
      expect(JSON.parse((await repos.learningEvents.findVoiceSettings())!.payload)).toEqual(
        original,
      );
      sql.exec("DROP TRIGGER fail_voice_setting");
      await repos.learningEvents.saveVoiceSettings(changed);
      expect(JSON.parse((await repos.learningEvents.findVoiceSettings())!.payload)).toEqual(
        changed,
      );
      expect(await repos.learningEvents.listTrainingCheckpoints()).toHaveLength(0);
      expect(
        await repos.learningEvents.listMemoryContributions("local-training-user"),
      ).toHaveLength(0);
      const rows = sql
        .prepare("SELECT COUNT(*) AS count FROM learning_events WHERE type = 'voice_settings'")
        .get()!;
      expect(rows.count).toBe(1);
    } finally {
      close();
    }
  });
});

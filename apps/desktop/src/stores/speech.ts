import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { call } from "../lib/ipc";
import {
  defaultSpeechSettings,
  speechSettingsSchema,
  saveSpeechKeys,
  type SpeechSettings,
} from "../speech/settings";

const repos = () => createRepositories(createTauriTransport(call));
interface SpeechStore {
  settings: SpeechSettings | null;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (settings: SpeechSettings, keys: { asr: string; tts: string }) => Promise<boolean>;
}
export const useSpeechStore = create<SpeechStore>((set, get) => ({
  settings: null,
  busy: false,
  error: null,
  load: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const row = await repos().learningEvents.findVoiceSettings();
      set({
        settings: row
          ? speechSettingsSchema.parse(JSON.parse(row.payload))
          : defaultSpeechSettings(),
      });
    } catch {
      set({ error: "Could not load speech settings. Retry to preserve your saved configuration." });
    } finally {
      set({ busy: false });
    }
  },
  save: async (raw, keys) => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      const settings = speechSettingsSchema.parse(raw);
      await saveSpeechKeys(settings, keys);
      const repository = repos();
      await repository.users.ensureLocalLearner();
      await repository.learningEvents.saveVoiceSettings(settings);
      set({ settings });
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error && error.message.startsWith("Save an API key")
            ? error.message
            : "Speech settings could not be saved. Check the endpoint, keyring and fields, then retry.",
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));

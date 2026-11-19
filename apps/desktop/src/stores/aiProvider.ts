import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { call } from "../lib/ipc";
import {
  aiProviderSettingsSchema,
  defaultAiProviderSettings,
  saveProviderKeys,
  type AiProviderSettings,
} from "../training/provider";

const repos = () => createRepositories(createTauriTransport(call));

interface AiProviderStore {
  /** 永不为 null：加载前用默认值，保证训练页可随时启动。 */
  settings: AiProviderSettings;
  loaded: boolean;
  configured: boolean;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (settings: AiProviderSettings, apiKey: string) => Promise<boolean>;
}

export const useAiProviderStore = create<AiProviderStore>((set, get) => ({
  settings: defaultAiProviderSettings(),
  loaded: false,
  configured: false,
  busy: false,
  error: null,
  load: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const row = await repos().learningEvents.findModelSettings();
      set({
        settings: row
          ? aiProviderSettingsSchema.parse(JSON.parse(row.payload))
          : defaultAiProviderSettings(),
        loaded: true,
        configured: row != null,
      });
    } catch {
      set({
        error: "Could not load AI connection settings. Retry to preserve your saved configuration.",
      });
    } finally {
      set({ busy: false });
    }
  },
  save: async (raw, apiKey) => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      const settings = aiProviderSettingsSchema.parse(raw);
      await saveProviderKeys(settings, apiKey);
      const repository = repos();
      await repository.users.ensureLocalLearner();
      await repository.learningEvents.saveModelSettings(settings);
      set({ settings, loaded: true, configured: true });
      return true;
    } catch {
      set({
        error:
          "AI connection settings could not be saved. Check the endpoint, keyring and fields, then retry.",
      });
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));

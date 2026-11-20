import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { isGatewayError, type GatewayErrorKind } from "@language-lab/model-gateway";
import { saveTrainingKey, verifyTrainingConnection } from "../training/gateway";
import { call } from "../lib/ipc";
import {
  aiProviderSettingsSchema,
  defaultAiProviderSettings,
  toTrainingProvider,
  type AiProviderSettings,
} from "../training/provider";

const repos = () => createRepositories(createTauriTransport(call));

type ConnectionCheck =
  { status: "unverified" | "checking" | "verified" } | { status: "failed"; kind: GatewayErrorKind };

interface AiProviderStore {
  /** 永不为 null：加载前用默认值，保证训练页可随时启动。 */
  settings: AiProviderSettings;
  loaded: boolean;
  configured: boolean;
  busy: boolean;
  connectionCheck: ConnectionCheck;
  error: string | null;
  load: () => Promise<void>;
  verify: () => Promise<void>;
  save: (settings: AiProviderSettings, apiKey: string) => Promise<boolean>;
}

export const useAiProviderStore = create<AiProviderStore>((set, get) => ({
  settings: defaultAiProviderSettings(),
  loaded: false,
  configured: false,
  busy: false,
  connectionCheck: { status: "unverified" },
  error: null,
  load: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const row = await repos().learningEvents.findModelSettings();
      const settings = row
        ? aiProviderSettingsSchema.parse(JSON.parse(row.payload))
        : defaultAiProviderSettings();
      set((state) => ({
        settings,
        loaded: true,
        configured: row != null,
        connectionCheck:
          state.settings.baseUrl === settings.baseUrl && state.settings.model === settings.model
            ? state.connectionCheck
            : { status: "unverified" },
      }));
    } catch {
      set({
        error: "Could not load AI connection settings. Retry to preserve your saved configuration.",
      });
    } finally {
      set({ busy: false });
    }
  },
  verify: async () => {
    if (get().busy || !get().configured || get().error) return;
    const { settings } = get();
    set({ busy: true, connectionCheck: { status: "checking" } });
    try {
      await verifyTrainingConnection(toTrainingProvider(settings));
      set({ connectionCheck: { status: "verified" } });
    } catch (error) {
      set({
        connectionCheck: {
          status: "failed",
          kind: isGatewayError(error) ? error.kind : "provider_error",
        },
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
      if (apiKey.trim()) {
        set({ connectionCheck: { status: "unverified" } });
        await saveTrainingKey(toTrainingProvider(settings), apiKey.trim());
      }
      const repository = repos();
      await repository.users.ensureLocalLearner();
      await repository.learningEvents.saveModelSettings(settings);
      set({ settings, loaded: true, configured: true, connectionCheck: { status: "unverified" } });
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

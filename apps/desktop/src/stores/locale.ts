import { create } from "zustand";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { call } from "../lib/ipc";
import { applyInterfaceLocale } from "../i18n";
import {
  canonicalLocale,
  localePreferenceSchema,
  selectAppLocale,
  systemLocaleInfoSchema,
  type LocalePreference,
  type LocaleSettings,
} from "../i18n/types";

const repos = () => createRepositories(createTauriTransport(call));
const fallbackInfo = () => ({
  systemLocale:
    canonicalLocale(typeof navigator === "undefined" ? "en-US" : navigator.language) ?? "en-US",
  regionLocale:
    typeof Intl === "undefined" ? "en-US" : Intl.DateTimeFormat().resolvedOptions().locale,
});
interface LocaleState extends LocaleSettings {
  ready: boolean;
  preferenceLoaded: boolean;
  saving: boolean;
  loading: boolean;
  preference: LocalePreference;
  error: "load" | "system" | "save" | null;
  initialize: () => Promise<void>;
  refreshSystem: () => Promise<void>;
  choose: (preference: LocalePreference) => Promise<boolean>;
}
let initializing: Promise<void> | undefined;
let systemGeneration = 0;
function publish(
  preference: LocalePreference,
  info: { systemLocale: string; regionLocale: string },
) {
  const appLocale = selectAppLocale(preference, info.systemLocale);
  applyInterfaceLocale(appLocale, info.regionLocale);
  useLocaleStore.setState({ ...info, preference, localeMode: preference.localeMode, appLocale });
}
async function readSystem() {
  return systemLocaleInfoSchema.parse(await deadline(call("get_system_locale")));
}
async function deadline<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("locale timeout")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const useLocaleStore = create<LocaleState>((set, get) => ({
  systemLocale: "en-US",
  regionLocale: "en-US",
  appLocale: "en-US",
  localeMode: "system",
  ready: false,
  preferenceLoaded: false,
  saving: false,
  loading: false,
  preference: { version: 1, localeMode: "system" },
  error: null,
  initialize: async () => {
    if (initializing) return initializing;
    if (get().saving) return;
    systemGeneration++;
    set({ loading: true });
    initializing = (async () => {
      const results = await Promise.allSettled([
        readSystem(),
        deadline(repos().learningEvents.findLocaleSettings()),
      ]);
      const info = results[0].status === "fulfilled" ? results[0].value : fallbackInfo();
      const defaultPreference: LocalePreference = { version: 1, localeMode: "system" };
      // A retry must not discard a previously loaded manual choice if storage fails.
      let preference: LocalePreference = get().preference;
      let preferenceLoaded = false;
      if (results[1].status === "fulfilled") {
        try {
          const parsed = localePreferenceSchema.safeParse(
            results[1].value ? JSON.parse(results[1].value.payload) : defaultPreference,
          );
          if (parsed.success) {
            preference = parsed.data;
            preferenceLoaded = true;
          }
        } catch {
          /* Preserve unknown preferences; never overwrite them during fallback. */
        }
      }
      publish(preference, info);
      set({
        ready: true,
        preferenceLoaded,
        error: !preferenceLoaded ? "load" : results[0].status === "rejected" ? "system" : null,
      });
    })()
      .catch(() => {
        publish(get().preference, fallbackInfo());
        set({ ready: true, preferenceLoaded: false, error: "load" });
      })
      .finally(() => {
        initializing = undefined;
        set({ loading: false });
      });
    return initializing;
  },
  refreshSystem: async () => {
    if (get().saving || get().loading) return;
    const generation = ++systemGeneration;
    try {
      const info = await readSystem();
      if (generation !== systemGeneration) return;
      publish(get().preference, info);
      if (get().error === "system") set({ error: null });
    } catch {
      if (generation === systemGeneration && !get().error) set({ error: "system" });
    }
  },
  choose: async (raw) => {
    if (get().saving || get().loading || !get().preferenceLoaded) return false;
    systemGeneration++;
    set({ saving: true });
    try {
      const preference = localePreferenceSchema.parse(raw);
      const info =
        preference.localeMode === "system"
          ? await readSystem()
          : { systemLocale: get().systemLocale, regionLocale: get().regionLocale };
      const repository = repos();
      await repository.users.ensureLocalLearner();
      await repository.learningEvents.saveLocaleSettings(preference);
      // A concurrent OS refresh cannot overwrite a newly saved manual choice.
      const latest =
        preference.localeMode === "system"
          ? info
          : { systemLocale: get().systemLocale, regionLocale: get().regionLocale };
      publish(preference, latest);
      set({ error: null });
      return true;
    } catch {
      set({ error: "save" });
      return false;
    } finally {
      set({ saving: false });
    }
  },
}));

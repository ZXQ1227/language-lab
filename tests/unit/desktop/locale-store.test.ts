import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleStore } from "../../../apps/desktop/src/stores/locale";
import { i18n } from "../../../apps/desktop/src/i18n";

let system = { systemLocale: "zh-CN", regionLocale: "en-GB" };
let payload: string | null;
let readFailure: boolean;
let saveFailure: boolean;
const invoke = vi.fn();
function row(value: string) {
  return {
    id: "locale-settings-local-training-user",
    user_id: "local-training-user",
    lesson_id: null,
    type: "locale_settings",
    payload: value,
    occurred_at: 0,
    created_at: 0,
    updated_at: 0,
  };
}
beforeEach(async () => {
  system = { systemLocale: "zh-CN", regionLocale: "en-GB" };
  payload = null;
  readFailure = saveFailure = false;
  invoke.mockReset();
  invoke.mockImplementation(
    async (command: string, args?: { sql?: string; params?: unknown[] }) => {
      if (command === "get_system_locale") return { ...system };
      if (command === "db_select") {
        if (readFailure) throw new Error("Synthetic read failure");
        return payload ? [row(payload)] : [];
      }
      if (command === "db_execute") {
        if (args?.params?.[2] === "locale_settings") {
          if (saveFailure) throw new Error("Synthetic write failure");
          payload = String(args.params[3]);
        }
        return { rowsAffected: 1, lastInsertId: "local-training-user" };
      }
      throw new Error("Unexpected command");
    },
  );
  vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
  await useLocaleStore.getState().initialize();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("locale preference persistence and races", () => {
  it("boots from native locale without persisting a derived choice", () => {
    expect(useLocaleStore.getState()).toMatchObject({
      appLocale: "zh-CN",
      regionLocale: "en-GB",
      localeMode: "system",
      ready: true,
      preferenceLoaded: true,
      error: null,
    });
    expect(payload).toBeNull();
  });
  it("restores manual choice after restart/OS changes and re-reads when following system again", async () => {
    expect(
      await useLocaleStore
        .getState()
        .choose({ version: 1, localeMode: "manual", appLocale: "en-US" }),
    ).toBe(true);
    expect(JSON.parse(payload!)).toEqual({ version: 1, localeMode: "manual", appLocale: "en-US" });
    system.systemLocale = "zh-TW";
    await useLocaleStore.getState().initialize();
    expect(i18n.language).toBe("en-US");
    await useLocaleStore.getState().refreshSystem();
    expect(useLocaleStore.getState().appLocale).toBe("en-US");
    expect(await useLocaleStore.getState().choose({ version: 1, localeMode: "system" })).toBe(true);
    expect(useLocaleStore.getState().appLocale).toBe("zh-TW");
    expect(JSON.parse(payload!)).toEqual({ version: 1, localeMode: "system" });
  });
  it("does not publish a failed write or overwrite unreadable preferences", async () => {
    saveFailure = true;
    expect(
      await useLocaleStore
        .getState()
        .choose({ version: 1, localeMode: "manual", appLocale: "en-US" }),
    ).toBe(false);
    expect(useLocaleStore.getState()).toMatchObject({ appLocale: "zh-CN", error: "save" });
    payload = "{broken JSON";
    await useLocaleStore.getState().initialize();
    expect(useLocaleStore.getState()).toMatchObject({ preferenceLoaded: false, error: "load" });
    expect(await useLocaleStore.getState().choose({ version: 1, localeMode: "system" })).toBe(
      false,
    );
    expect(payload).toBe("{broken JSON");
  });
  it("preserves unknown versioned preferences and reports repository read failure", async () => {
    payload = JSON.stringify({ version: 99, localeMode: "manual", appLocale: "zh-TW" });
    await useLocaleStore.getState().initialize();
    expect(useLocaleStore.getState().preferenceLoaded).toBe(false);
    readFailure = true;
    await useLocaleStore.getState().initialize();
    expect(useLocaleStore.getState().error).toBe("load");
    expect(JSON.parse(payload).version).toBe(99);
  });
  it("invalidates an older OS response when a manual preference is saved", async () => {
    let release!: (value: unknown) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const refresh = useLocaleStore.getState().refreshSystem();
    await useLocaleStore
      .getState()
      .choose({ version: 1, localeMode: "manual", appLocale: "en-US" });
    release({ systemLocale: "zh-TW", regionLocale: "zh-TW" });
    await refresh;
    expect(useLocaleStore.getState()).toMatchObject({
      appLocale: "en-US",
      systemLocale: "zh-CN",
      localeMode: "manual",
    });
  });
  it("keeps a known manual choice when a later preference reload fails", async () => {
    await useLocaleStore
      .getState()
      .choose({ version: 1, localeMode: "manual", appLocale: "en-US" });
    readFailure = true;
    system.systemLocale = "zh-TW";
    await useLocaleStore.getState().initialize();
    expect(useLocaleStore.getState()).toMatchObject({
      appLocale: "en-US",
      localeMode: "manual",
      preferenceLoaded: false,
      error: "load",
    });
    await useLocaleStore.getState().initialize();
    expect(useLocaleStore.getState().appLocale).toBe("en-US");
    expect(JSON.parse(payload!).appLocale).toBe("en-US");
  });
  it("bounds unavailable native IPC and recovers without writing a fallback preference", async () => {
    vi.useFakeTimers();
    invoke.mockImplementationOnce(() => new Promise(() => {}));
    const initializing = useLocaleStore.getState().initialize();
    await vi.advanceTimersByTimeAsync(5000);
    await initializing;
    expect(useLocaleStore.getState()).toMatchObject({
      ready: true,
      error: "system",
      preferenceLoaded: true,
    });
    expect(payload).toBeNull();
    await useLocaleStore.getState().refreshSystem();
    expect(useLocaleStore.getState()).toMatchObject({ appLocale: "zh-CN", error: null });
  });
});

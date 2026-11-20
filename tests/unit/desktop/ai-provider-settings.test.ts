import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAiProviderStore } from "../../../apps/desktop/src/stores/aiProvider";

// The AI connection (AI 基座) settings live in the Settings page; the training
// page only consumes them. These tests pin the persistence contract.

let payload: string | null;
let readFailure: boolean;
let saveFailure: boolean;
const invoke = vi.fn();
function row(value: string) {
  return {
    id: "model-settings-local-training-user",
    user_id: "local-training-user",
    lesson_id: null,
    type: "model_settings",
    payload: value,
    occurred_at: 0,
    created_at: 0,
    updated_at: 0,
  };
}
beforeEach(async () => {
  payload = null;
  readFailure = saveFailure = false;
  invoke.mockReset();
  invoke.mockImplementation(
    async (command: string, args?: { sql?: string; params?: unknown[] }) => {
      if (command === "db_select") {
        if (readFailure) throw new Error("Synthetic read failure");
        return payload ? [row(payload)] : [];
      }
      if (command === "db_execute") {
        if (args?.params?.[2] === "model_settings") {
          if (saveFailure) throw new Error("Synthetic write failure");
          payload = String(args.params[3]);
        }
        return { rowsAffected: 1, lastInsertId: "local-training-user" };
      }
      if (command === "secrets_set" || command === "secrets_get") return null;
      throw new Error(`Unexpected command: ${command}`);
    },
  );
  vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
  useAiProviderStore.setState({
    settings: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
    loaded: false,
    configured: false,
    connectionCheck: { status: "unverified" },
    busy: false,
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai provider settings store", () => {
  it("starts with sensible defaults before anything is persisted", async () => {
    await useAiProviderStore.getState().load();
    expect(useAiProviderStore.getState().settings).toEqual({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.2",
    });
    expect(useAiProviderStore.getState().loaded).toBe(true);
  });

  it("load() replaces defaults with the persisted row", async () => {
    payload = JSON.stringify({ baseUrl: "https://api.example.com/v1", model: "gpt-4o-mini" });
    await useAiProviderStore.getState().load();
    expect(useAiProviderStore.getState().settings).toEqual({
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4o-mini",
    });
  });

  it("load() falls back to defaults on a read failure and surfaces the error", async () => {
    readFailure = true;
    await useAiProviderStore.getState().load();
    expect(useAiProviderStore.getState().error).toContain("Could not load AI connection settings");
    expect(useAiProviderStore.getState().settings.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("save() validates, persists and rejects malformed endpoints", async () => {
    const ok = await useAiProviderStore
      .getState()
      .save({ baseUrl: "https://api.example.com/v1", model: "gpt-4o-mini" }, "");
    expect(ok).toBe(true);
    expect(useAiProviderStore.getState().settings.model).toBe("gpt-4o-mini");

    const bad = await useAiProviderStore
      .getState()
      .save({ baseUrl: "not-a-url", model: "gpt-4o-mini" }, "");
    expect(bad).toBe(false);
    expect(useAiProviderStore.getState().settings.model).toBe("gpt-4o-mini");
  });

  it("save() writes exactly the validated endpoint and model", async () => {
    await useAiProviderStore
      .getState()
      .save({ baseUrl: "https://api.example.com/v1", model: "gpt-4o" }, "");
    expect(payload).toEqual(
      JSON.stringify({ baseUrl: "https://api.example.com/v1", model: "gpt-4o" }),
    );
  });

  it("save() surfaces a failure without corrupting the current settings", async () => {
    saveFailure = true;
    const ok = await useAiProviderStore
      .getState()
      .save({ baseUrl: "https://api.example.com/v1", model: "gpt-4o" }, "");
    expect(ok).toBe(false);
    expect(useAiProviderStore.getState().error).toContain("could not be saved");
    expect(useAiProviderStore.getState().settings.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("uses the training endpoint policy before writing settings or credentials", async () => {
    for (const baseUrl of [
      "http://example.com/v1",
      "https://name:secret@example.com/v1",
      "https://example.com/v1?",
    ]) {
      expect(
        await useAiProviderStore.getState().save({ baseUrl, model: "test" }, "synthetic-key"),
      ).toBe(false);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("verifies a saved endpoint with only the fixed structured probe and forgets the result on save", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"ok":false}' } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
    vi.stubGlobal("fetch", fetch);
    const store = useAiProviderStore.getState();
    const settings = { baseUrl: "http://localhost:11434/v1/", model: "test-model" };
    expect(await store.save(settings, "")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await store.verify();
    expect(useAiProviderStore.getState().connectionCheck).toEqual({
      status: "failed",
      kind: "schema_violation",
    });
    await store.verify();
    expect(useAiProviderStore.getState().connectionCheck).toEqual({ status: "verified" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "test-model",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: 'Reply only with this JSON object: {"ok":true}' }],
    });
    expect(JSON.parse(init.body).messages).toHaveLength(1);
    expect(await store.save({ ...settings, model: "next-model" }, "")).toBe(true);
    expect(useAiProviderStore.getState().connectionCheck).toEqual({ status: "unverified" });
  });
});

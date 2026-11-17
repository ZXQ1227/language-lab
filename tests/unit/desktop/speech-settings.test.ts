import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { invoke, secrets } = vi.hoisted(() => ({
  invoke: vi.fn(),
  secrets: new Map<string, string>(),
}));
import {
  defaultSpeechSettings,
  saveSpeechKeys,
  speechAsr,
  speechSettingsSchema,
  speechTts,
} from "../../../apps/desktop/src/speech/settings";
beforeEach(() => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
  secrets.clear();
  invoke.mockReset();
  invoke.mockImplementation(async (command: string, args: Record<string, string>) => {
    if (command === "secrets_set") {
      secrets.set(args.name!, args.value!);
      return;
    }
    if (command === "secrets_get") return secrets.get(args.name!) ?? null;
    throw new Error("Unexpected IPC command");
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("speech credentials and preferences", () => {
  it("keeps ASR/TTS credentials separate and scopes them to the normalized exact endpoint", async () => {
    const raw = defaultSpeechSettings();
    raw.asr.enabled = true;
    raw.tts.mode = "provider";
    raw.asr.baseUrl += "/";
    const settings = speechSettingsSchema.parse(raw);
    await saveSpeechKeys(settings, { asr: "recognition-private-key", tts: "playback-private-key" });
    expect(secrets.size).toBe(2);
    expect([...secrets.keys()].some((k) => k.startsWith("asr.speech."))).toBe(true);
    expect([...secrets.keys()].some((k) => k.startsWith("tts.speech."))).toBe(true);
    expect((await speechAsr(settings)).id).toContain("asr");
    expect((await speechTts(settings)).id).toContain("tts");
    const moved = { ...settings, asr: { ...settings.asr, baseUrl: "https://other.example/v1" } };
    await expect(speechAsr(moved)).rejects.toThrow(/Save an API key/);
    expect(JSON.stringify(settings)).not.toContain("private-key");
    expect(
      invoke.mock.calls.every(
        ([command]) => command === "secrets_set" || command === "secrets_get",
      ),
    ).toBe(true);
  });
  it("supports keyless localhost and never silently falls back to mock recognition", async () => {
    const settings = defaultSpeechSettings();
    await expect(speechAsr(settings)).rejects.toThrow(/Enable speech recognition/);
    settings.asr = { ...settings.asr, enabled: true, baseUrl: "http://localhost:9191/v1" };
    const asr = await speechAsr(settings);
    expect(asr.id).toBe("openai-asr:whisper-1");
    expect(secrets.size).toBe(0);
  });
});

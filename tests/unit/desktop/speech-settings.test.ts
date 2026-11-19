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
    raw.asr.mode = "provider";
    raw.tts.mode = "provider";
    raw.asr.baseUrl += "/";
    const settings = speechSettingsSchema.parse(raw);
    await saveSpeechKeys(settings, { asr: "recognition-private-key", tts: "playback-private-key" });
    expect(secrets.size).toBe(2);
    expect([...secrets.keys()].some((k) => k.startsWith("asr.speech."))).toBe(true);
    expect([...secrets.keys()].some((k) => k.startsWith("tts.speech."))).toBe(true);
    expect((await speechAsr(settings)).id).toBe("openai-asr:whisper-1");
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
    settings.asr = {
      ...settings.asr,
      enabled: true,
      mode: "provider",
      baseUrl: "http://localhost:9191/v1",
    };
    const asr = await speechAsr(settings);
    expect(asr.id).toBe("openai-asr:whisper-1");
    expect(secrets.size).toBe(0);
  });
  it("defaults new settings to device recognition and needs no credentials for it", async () => {
    const settings = defaultSpeechSettings();
    expect(settings.asr.mode).toBe("device");
    const enabled = { ...settings, asr: { ...settings.asr, enabled: true } };
    const asr = await speechAsr(enabled);
    expect(asr.id).toBe("device-asr:macos-speech");
    expect(invoke.mock.calls.every(([command]) => !command.startsWith("secrets_"))).toBe(true);
  });
  it("migrates settings saved before device recognition to the endpoint flow", () => {
    const legacy = {
      version: 1,
      asr: {
        enabled: true,
        baseUrl: "https://api.siliconflow.cn/v1",
        model: "FunAudioLLM/SenseVoiceSmall",
      },
      tts: {
        enabled: undefined,
        mode: "system",
        baseUrl: "https://api.openai.com/v1",
        model: "tts-1",
        voice: "alloy",
        rate: 1,
        autoRead: false,
      },
    } as unknown as Record<string, unknown>;
    const settings = speechSettingsSchema.parse(legacy);
    expect(settings.asr.mode).toBe("provider");
    expect(settings.asr.baseUrl).toBe("https://api.siliconflow.cn/v1");
  });
});

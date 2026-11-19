import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TtsProvider } from "@language-lab/model-gateway";
import { SpeechPlayback, type PlaybackState } from "../../../apps/desktop/src/speech/playback";
import {
  defaultSpeechSettings,
  speechSettingsSchema,
} from "../../../apps/desktop/src/speech/settings";
import {
  characterVoiceStyle,
  preferredVoiceStyle,
  selectProviderVoice,
} from "../../../apps/desktop/src/speech/voices";

class Utterance {
  lang = "";
  rate = 1;
  voice?: SpeechSynthesisVoice;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}
class AudioStub {
  static instances: AudioStub[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  constructor(readonly src: string) {
    AudioStub.instances.push(this);
  }
}
const synthesis = Object.assign(new EventTarget(), {
  getVoices: vi.fn(),
  speak: vi.fn(),
  cancel: vi.fn(),
});
function setup() {
  const states: PlaybackState[] = [];
  return { states, player: new SpeechPlayback((s) => states.push(s)) };
}
beforeEach(() => {
  synthesis.speak.mockReset();
  synthesis.cancel.mockReset();
  synthesis.getVoices.mockReturnValue([
    { name: "Remote", lang: "en-US", localService: false },
    { name: "Installed English", lang: "en-GB", localService: true },
  ]);
  vi.stubGlobal("window", { speechSynthesis: synthesis });
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("Audio", AudioStub);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-speech");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  AudioStub.instances = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("speech playback lifecycle", () => {
  it("uses a local female voice for Zoi and respects an explicit male override", async () => {
    const { player } = setup();
    const settings = defaultSpeechSettings();
    synthesis.getVoices.mockReturnValue([
      { name: "Daniel", lang: "en-US", localService: true, default: true },
      { name: "Samantha", lang: "en-US", localService: false },
      { name: "Microsoft Zira", lang: "en-GB", localService: true },
      { name: "Samantha (Enhanced)", lang: "en-US", localService: true },
    ]);
    await player.play("Welcome", "en-US", settings, vi.fn(), characterVoiceStyle());
    expect(synthesis.speak.mock.calls[0]![0].voice.name).toBe("Samantha (Enhanced)");
    settings.tts.voiceMode = "male";
    await player.play("Welcome", "en-US", settings, vi.fn(), characterVoiceStyle());
    expect(synthesis.speak.mock.calls[1]![0].voice.name).toBe("Daniel");
    player.dispose();
  });
  it("falls back within the course language when the desired local voice is missing", async () => {
    const { player } = setup();
    synthesis.getVoices.mockReturnValue([
      { name: "Samantha", lang: "en-US", localService: true },
      { name: "Ting-Ting", lang: "zh-CN", localService: false },
      { name: "Microsoft Yunxi", lang: "zh-CN", localService: true },
    ]);
    await player.play("你好", "zh-CN", defaultSpeechSettings(), vi.fn(), characterVoiceStyle());
    expect(synthesis.speak.mock.calls[0]![0].voice.name).toBe("Microsoft Yunxi");
    player.dispose();
  });
  it("selects a local course-language voice and stops it on completion or disposal", async () => {
    const { player, states } = setup();
    const settings = defaultSpeechSettings();
    settings.tts.rate = 0.8;
    const forbidden = vi.fn();
    await player.play("Welcome", "en", settings, forbidden);
    const utterance = synthesis.speak.mock.calls[0]![0] as Utterance;
    expect(utterance.voice).toMatchObject({ localService: true, lang: "en-GB" });
    expect(utterance.rate).toBe(0.8);
    expect(forbidden).not.toHaveBeenCalled();
    utterance.onend!();
    expect(states.at(-1)?.phase).toBe("idle");
    player.dispose();
    expect(synthesis.cancel).toHaveBeenCalled();
  });
  it("does not substitute a remote or wrong-language voice when no installed voice matches", async () => {
    vi.useFakeTimers();
    const { player, states } = setup();
    const waiting = player.play("Bonjour", "fr", defaultSpeechSettings(), vi.fn());
    await vi.advanceTimersByTimeAsync(1500);
    await waiting;
    expect(states.at(-1)?.error).toContain("No installed device voice");
    expect(synthesis.speak).not.toHaveBeenCalled();
    player.dispose();
  });
  it("revokes provider audio URLs and pauses playback when another reply starts or the view closes", async () => {
    const { player, states } = setup();
    const settings = defaultSpeechSettings();
    settings.tts.mode = "provider";
    const synthesize = vi
      .fn<TtsProvider["synthesize"]>()
      .mockResolvedValue({ audio: new Uint8Array([73, 68, 51, 0]), mimeType: "audio/mpeg" });
    const provider = async () => ({
      id: "test-tts",
      synthesize,
      healthCheck: async () => ({ ok: true }),
    });
    await player.play("First", "en", settings, provider, characterVoiceStyle());
    expect(synthesize).toHaveBeenLastCalledWith("First", "nova", expect.anything());
    const first = AudioStub.instances[0]!;
    expect(states.at(-1)?.phase).toBe("speaking");
    await player.play("Second", "en", settings, provider, characterVoiceStyle({ name: "Daniel" }));
    expect(synthesize).toHaveBeenLastCalledWith("Second", "onyx", expect.anything());
    expect(first.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    player.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(AudioStub.instances[1]!.pause).toHaveBeenCalledOnce();
  });
  it("ignores synthesis that completes after cancellation and allows replay without changing a lesson", async () => {
    const { player, states } = setup();
    const settings = defaultSpeechSettings();
    settings.tts.mode = "provider";
    let resolve!: (value: { audio: Uint8Array; mimeType: string }) => void;
    const synthesize = vi.fn<TtsProvider["synthesize"]>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const waiting = player.play("Late", "en", settings, async () => ({
      id: "test",
      synthesize,
      healthCheck: async () => ({ ok: true }),
    }));
    await Promise.resolve();
    player.stop();
    resolve({ audio: new Uint8Array([73, 68, 51]), mimeType: "audio/mpeg" });
    await waiting;
    expect(states.at(-1)?.phase).toBe("idle");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(synthesize.mock.calls[0]![2]!.signal!.aborted).toBe(true);
  });
});

describe("character voice choices", () => {
  it("matches only known characters and lets authored preferences take precedence", () => {
    expect(characterVoiceStyle()).toBe("female");
    expect(characterVoiceStyle({ name: " MAYA " })).toBe("female");
    expect(characterVoiceStyle({ name: "Daniel" })).toBe("male");
    expect(characterVoiceStyle({ name: "Taylor" })).toBeUndefined();
    expect(characterVoiceStyle({ name: "Maya", voiceStyle: "male" })).toBe("male");
  });

  it("keeps older provider IDs and uses configured IDs with custom endpoints", () => {
    const defaults = defaultSpeechSettings();
    const legacy = speechSettingsSchema.parse({
      ...defaults,
      tts: { ...defaults.tts, voiceMode: undefined, mode: "provider", voice: "custom" },
    });
    const zoi = characterVoiceStyle();
    expect(preferredVoiceStyle(legacy.tts, zoi)).toBeUndefined();
    expect(selectProviderVoice(legacy.tts)).toBe("custom");
    const provider = {
      ...legacy.tts,
      voiceMode: "auto" as const,
      baseUrl: "http://localhost:9191/v1",
      femaleVoice: "af_heart",
    };
    expect(selectProviderVoice(provider, preferredVoiceStyle(provider, zoi))).toBe("af_heart");
    expect(selectProviderVoice(provider, "male")).toBe("custom");
    expect(preferredVoiceStyle({ ...legacy.tts, mode: "system" }, zoi)).toBe("female");
  });
});

import { GatewayError, type TtsProvider } from "@language-lab/model-gateway";
import type { VoiceStyle } from "@language-lab/core";
import type { SpeechSettings } from "./settings";
import { preferredVoiceStyle, selectDeviceVoice, selectProviderVoice } from "./voices";

export const speechPlaybackTextLimit = 4_000;

export interface PlaybackState {
  phase: "idle" | "loading" | "speaking" | "error";
  error?: string;
}
function installedVoice(
  language: string,
  signal: AbortSignal,
  style?: VoiceStyle,
): Promise<SpeechSynthesisVoice> {
  return new Promise((resolve, reject) => {
    const synthesis = window.speechSynthesis;
    const cleanup = () => {
      clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", check);
      signal.removeEventListener("abort", cancelled);
    };
    const cancelled = () => {
      cleanup();
      reject(new Error("cancelled"));
    };
    const check = () => {
      const voice = selectDeviceVoice(synthesis.getVoices(), language, style);
      if (voice) {
        cleanup();
        resolve(voice);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("voice_missing"));
    }, 1500);
    synthesis.addEventListener("voiceschanged", check);
    signal.addEventListener("abort", cancelled, { once: true });
    if (signal.aborted) cancelled();
    else check();
  });
}

/** A single player owns all audio, object URLs and device utterances for this lesson view. */
export class SpeechPlayback {
  private generation = 0;
  private disposed = false;
  private abort?: AbortController;
  private audio?: HTMLAudioElement;
  private url?: string;
  private utterance?: SpeechSynthesisUtterance;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly update: (state: PlaybackState) => void) {}
  private release() {
    clearTimeout(this.timer);
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = undefined;
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = undefined;
    }
    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      window.speechSynthesis?.cancel();
      this.utterance = undefined;
    }
  }
  stop() {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    this.release();
    if (!this.disposed) this.update({ phase: "idle" });
  }
  dispose() {
    this.disposed = true;
    this.stop();
  }
  async play(
    text: string,
    language: string,
    settings: SpeechSettings,
    provider: () => Promise<TtsProvider>,
    characterStyle?: VoiceStyle,
  ) {
    if (this.disposed) return;
    this.stop();
    if (settings.tts.mode === "off") return;
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    this.update({ phase: "loading" });
    const active = () => generation === this.generation && !this.disposed;
    const finish = () => {
      if (active()) this.stop();
    };
    const fail = (message: string) => {
      if (active()) {
        this.stop();
        this.update({ phase: "error", error: message });
      }
    };
    this.timer = setTimeout(() => {
      if (active()) {
        this.stop();
        this.update({
          phase: "error",
          error: "Playback took too long. You can retry reading the reply.",
        });
      }
    }, 120000);
    try {
      if (!text.trim() || text.length > speechPlaybackTextLimit) throw new Error("text_limit");
      const style = preferredVoiceStyle(settings.tts, characterStyle);
      if (settings.tts.mode === "system") {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined")
          throw new Error("voice_missing");
        const voice = await installedVoice(language, abort.signal, style);
        if (!active()) return;
        const utterance = new SpeechSynthesisUtterance(text);
        this.utterance = utterance;
        utterance.lang = voice.lang;
        utterance.voice = voice;
        utterance.rate = settings.tts.rate;
        utterance.onend = finish;
        utterance.onerror = () =>
          fail("Device playback failed. Retry or choose a TTS provider in Settings.");
        window.speechSynthesis.speak(utterance);
      } else {
        const tts = await provider();
        if (!active()) return;
        const result = await tts.synthesize(text, selectProviderVoice(settings.tts, style), {
          signal: abort.signal,
        });
        if (!active()) return;
        this.url = URL.createObjectURL(
          new Blob([new Uint8Array(result.audio)], { type: result.mimeType }),
        );
        const audio = new Audio(this.url);
        this.audio = audio;
        audio.onended = finish;
        audio.onerror = () => fail("Audio playback failed. Retry reading the reply.");
        await audio.play();
      }
      if (active()) this.update({ phase: "speaking" });
    } catch (error) {
      const message =
        error instanceof GatewayError
          ? error.message
          : error instanceof Error && error.message === "voice_missing"
            ? `No installed device voice is available for ${language}. Choose a TTS provider in Settings or use text.`
            : "Could not play this reply. Try the read button again, or check speech settings.";
      fail(message);
    }
  }
}

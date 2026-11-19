import { useEffect, useRef, useState } from "react";
import type { VoiceStyle } from "@language-lab/core";
import { useSpeechStore } from "../stores/speech";
import { SpeechCapture, type CaptureState } from "./capture";
import { SpeechPlayback, type PlaybackState } from "./playback";
import { speechAsr, speechTts } from "./settings";

export function useSpeechLoop(
  lessonId: string | undefined,
  language: string,
  characterVoice?: VoiceStyle,
) {
  const { settings, error, load } = useSpeechStore();
  const [capture, setCapture] = useState<CaptureState>({ phase: "idle" });
  const [playback, setPlayback] = useState<PlaybackState>({ phase: "idle" });
  const recorder = useRef<SpeechCapture | null>(null);
  const player = useRef<SpeechPlayback | null>(null);
  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);
  useEffect(() => {
    setCapture({ phase: "idle" });
    setPlayback({ phase: "idle" });
    if (!lessonId || !settings) return;
    const input = new SpeechCapture(() => speechAsr(settings), language, setCapture);
    const output = new SpeechPlayback(setPlayback);
    recorder.current = input;
    player.current = output;
    return () => {
      input.dispose();
      output.dispose();
      recorder.current = null;
      player.current = null;
    };
  }, [lessonId, language, settings]);
  const capturing = ["requesting", "recording", "recognizing"].includes(capture.phase);
  const speak = (text: string) => {
    if (settings && !capturing)
      void player.current?.play(
        text,
        language,
        settings,
        () => speechTts(settings),
        characterVoice,
      );
  };
  return {
    settings,
    error,
    load,
    capture,
    playback,
    capturing,
    start: () => {
      player.current?.stop();
      void recorder.current?.start();
    },
    stopRecording: () => recorder.current?.stop(),
    cancel: () => recorder.current?.cancel(),
    retry: () => recorder.current?.retry(),
    speak,
    stopPlayback: () => player.current?.stop(),
    readAfterSave: (text: string) => {
      if (settings?.tts.autoRead) speak(text);
    },
  };
}

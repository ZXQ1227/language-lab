import { useEffect, useState } from "react";
import type { SpeechInput } from "@language-lab/core";
import type { useSpeechLoop } from "../speech/useSpeechLoop";
import { useNavStore } from "../stores/nav";

export function VoiceInput({
  voice,
  busy,
  hasDraft,
  remainingCharacters,
  language,
  onUse,
}: {
  voice: ReturnType<typeof useSpeechLoop>;
  busy: boolean;
  hasDraft: boolean;
  remainingCharacters: number;
  language: string;
  onUse: (text: string, recognized: string, speech: SpeechInput) => void;
}) {
  const { capture } = voice;
  const navigate = useNavStore((s) => s.navigate);
  const [text, setText] = useState("");
  useEffect(() => {
    setText(capture.text ?? "");
  }, [capture.text]);
  const button = "rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
  return (
    <section
      aria-label="Voice input"
      className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || !voice.settings?.asr.enabled || voice.capturing}
          onClick={voice.start}
        >
          Record reply
        </button>
        {capture.phase === "recording" && (
          <button type="button" className={button} onClick={voice.stopRecording}>
            Stop and recognize
          </button>
        )}
        {capture.phase !== "idle" && (
          <button type="button" className={button} onClick={voice.cancel}>
            Cancel voice input
          </button>
        )}
        <button
          type="button"
          className="text-sm underline"
          disabled={busy || voice.capturing}
          onClick={() => navigate("settings")}
        >
          Speech settings
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {voice.settings?.asr.enabled
          ? "Recording goes to your configured ASR endpoint. Maximum 45 seconds / 5 MB. Review the transcript before sending; audio is not saved."
          : "Enable speech recognition in Settings to record. Text replies remain available."}
      </p>
      {voice.error && (
        <p role="alert" className="text-sm text-red-700">
          {voice.error}
          <button type="button" className="ml-2 underline" onClick={() => void voice.load()}>
            Retry speech setup
          </button>
        </p>
      )}
      {capture.phase === "requesting" && (
        <p role="status" className="text-sm">
          Waiting for microphone permission…
        </p>
      )}
      {capture.phase === "recording" && (
        <p role="status" className="text-sm">
          Recording… Stop when your reply is complete.
        </p>
      )}
      {capture.phase === "recognizing" && (
        <p role="status" className="text-sm">
          Recognizing speech…
        </p>
      )}
      {capture.error && (
        <p role="alert" className="text-sm text-red-700">
          {capture.error}{" "}
          {capture.canRetry && (
            <button type="button" className="ml-2 underline" disabled={busy} onClick={voice.retry}>
              Retry recognition
            </button>
          )}
        </p>
      )}
      {capture.phase === "review" && (
        <>
          <label className="block text-sm">
            Recognized speech
            <textarea
              className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"
              rows={3}
              maxLength={4000}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            {capture.confidence === undefined
              ? "Recognition confidence was not supplied."
              : capture.confidence < 0.75
                ? "Low recognition confidence. Check every word carefully."
                : "Check the recognized words before using them."}{" "}
            This is not a pronunciation or fluency assessment.
          </p>
          <button
            type="button"
            className={button}
            disabled={busy || !text.trim() || text.trim().length > remainingCharacters}
            onClick={() => {
              onUse(text.trim(), capture.text!, {
                providerId: capture.providerId!,
                language,
                confidence: capture.confidence,
                edited: text.trim() !== capture.text,
              });
              voice.cancel();
            }}
          >
            {hasDraft ? "Append transcript to draft" : "Use transcript"}
          </button>
          {text.trim().length > remainingCharacters && (
            <p role="alert" className="text-sm text-red-700">
              The combined draft exceeds 4000 characters. Shorten the transcript before appending
              it.
            </p>
          )}
        </>
      )}
    </section>
  );
}

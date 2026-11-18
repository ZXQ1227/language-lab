import { LocalizedError } from "./LocalizedError";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { capture } = voice;
  const navigate = useNavStore((s) => s.navigate);
  const [text, setText] = useState("");
  useEffect(() => {
    setText(capture.text ?? "");
  }, [capture.text]);
  const button = "rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
  return (
    <section
      aria-label={t("speech:voiceInput")}
      className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || !voice.settings?.asr.enabled || voice.capturing}
          onClick={voice.start}
        >
          {t("speech:recordReply")}
        </button>
        {capture.phase === "recording" && (
          <button type="button" className={button} onClick={voice.stopRecording}>
            {t("speech:stopAndRecognize")}
          </button>
        )}
        {capture.phase !== "idle" && (
          <button type="button" className={button} onClick={voice.cancel}>
            {t("speech:cancelVoiceInput")}
          </button>
        )}
        <button
          type="button"
          className="text-sm underline"
          disabled={busy || voice.capturing}
          onClick={() => navigate("settings")}
        >
          {t("speech:speechSettings")}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {voice.settings?.asr.enabled
          ? t("speech:recordingGoesToYourConfiguredASREndpointMaximum45Seconds")
          : t("speech:enableSpeechRecognitionInSettingsToRecordTextRepliesRemain")}
      </p>
      {voice.error && (
        <p role="alert" className="text-sm text-red-700">
          <LocalizedError error={voice.error} />
          <button type="button" className="ml-2 underline" onClick={() => void voice.load()}>
            {t("speech:retrySpeechSetup")}
          </button>
        </p>
      )}
      {capture.phase === "requesting" && (
        <p role="status" className="text-sm">
          {t("speech:waitingForMicrophonePermission")}
        </p>
      )}
      {capture.phase === "recording" && (
        <p role="status" className="text-sm">
          {t("speech:recordingStopWhenYourReplyIsComplete")}
        </p>
      )}
      {capture.phase === "recognizing" && (
        <p role="status" className="text-sm">
          {t("speech:recognizingSpeech")}
        </p>
      )}
      {capture.error && (
        <p role="alert" className="text-sm text-red-700">
          <LocalizedError error={capture.error} />{" "}
          {capture.canRetry && (
            <button type="button" className="ml-2 underline" disabled={busy} onClick={voice.retry}>
              {t("speech:retryRecognition")}
            </button>
          )}
        </p>
      )}
      {capture.phase === "review" && (
        <>
          <label className="block text-sm">
            {t("speech:recognizedSpeech")}
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
              ? t("speech:recognitionConfidenceWasNotSupplied")
              : capture.confidence < 0.75
                ? t("speech:lowRecognitionConfidenceCheckEveryWordCarefully")
                : t("speech:checkTheRecognizedWordsBeforeUsingThem")}{" "}
            {t("speech:thisIsNotAPronunciationOrFluencyAssessment")}
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
            {hasDraft ? t("speech:appendTranscriptToDraft") : t("speech:useTranscript")}
          </button>
          {text.trim().length > remainingCharacters && (
            <p role="alert" className="text-sm text-red-700">
              {t("speech:theCombinedDraftExceeds4000CharactersShortenTheTranscriptBefore")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

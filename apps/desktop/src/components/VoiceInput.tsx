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
  const button = "button-secondary rounded px-3 py-2 text-sm disabled:opacity-40";
  const showSettings = !voice.settings?.asr.enabled || !!voice.error;
  const active = capture.phase !== "idle";
  if (!active && !showSettings) return null;
  return (
    <section
      aria-label={t("speech:voiceInput")}
      className="space-y-2 rounded-xl bg-surface-secondary px-3 py-2 text-sm"
    >
      {(showSettings || active) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showSettings && (
            <>
              <p className="text-xs text-ink-muted">{t("training:focus.microphoneSetup")}</p>
              <button
                type="button"
                className="text-xs font-semibold text-brand-ink underline"
                disabled={busy || voice.capturing}
                onClick={() => navigate("settings")}
              >
                {t("speech:speechSettings")}
              </button>
            </>
          )}
          {active && (
            <button
              type="button"
              className="text-xs font-semibold underline"
              onClick={voice.cancel}
            >
              {t("speech:cancelVoiceInput")}
            </button>
          )}
        </div>
      )}
      {voice.error && (
        <p role="alert" className="text-sm text-error-ink">
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
        <p
          role="status"
          className="w-fit rounded-md bg-brand-primary-soft px-2 py-1 text-sm text-brand-ink"
        >
          {t("speech:recordingStopWhenYourReplyIsComplete")}
        </p>
      )}
      {capture.phase === "recognizing" && (
        <p role="status" className="text-sm">
          {t("speech:recognizingSpeech")}
        </p>
      )}
      {capture.error && (
        <p role="alert" className="text-sm text-error-ink">
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
              className="mt-1 block w-full rounded border form-control p-2"
              rows={3}
              maxLength={4000}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p className="text-xs text-ink-muted">
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
            <p role="alert" className="text-sm text-error-ink">
              {t("speech:theCombinedDraftExceeds4000CharactersShortenTheTranscriptBefore")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

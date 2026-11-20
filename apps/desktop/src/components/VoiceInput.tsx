import { LocalizedError } from "./LocalizedError";
import { useTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import type { SpeechInput } from "@language-lab/core";
import type { useSpeechLoop } from "../speech/useSpeechLoop";
import { useNavStore } from "../stores/nav";

/**
 * Voice input commits straight into the composer: as soon as recognition
 * succeeds the transcript is inserted into the reply draft and the capture
 * lifecycle ends. The learner reviews by reading and editing the draft itself
 * before sending, so there is no separate confirmation panel.
 */
export function VoiceInput({
  voice,
  busy,
  language,
  onUse,
}: {
  voice: ReturnType<typeof useSpeechLoop>;
  busy: boolean;
  language: string;
  onUse: (text: string, recognized: string, speech: SpeechInput) => void;
}) {
  const { t } = useTranslation();
  const { capture } = voice;
  const navigate = useNavStore((s) => s.navigate);
  const committed = useRef<string | null>(null);
  useEffect(() => {
    if (capture.phase === "recording") committed.current = null;
    if (capture.phase !== "review" || !capture.text || !capture.providerId) return;
    if (committed.current === capture.text) return;
    committed.current = capture.text;
    onUse(capture.text, capture.text, {
      providerId: capture.providerId,
      language,
      confidence: capture.confidence,
      edited: false,
    });
    voice.cancel();
  }, [capture.phase, capture.text, capture.providerId, capture.confidence, language, onUse, voice]);
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
    </section>
  );
}

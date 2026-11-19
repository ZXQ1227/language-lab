import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DialogueSupport, SpeechInput } from "@language-lab/core";
import { formatNumber } from "../i18n";
import { useTrainingStore } from "../stores/training";
import { getGuidedExample, type TrainingSession } from "../training/session";
import type { useSpeechLoop } from "../speech/useSpeechLoop";
import { VoiceInput } from "./VoiceInput";

const action = "button-secondary rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";
const record = "button-record rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50";
const primary = "rounded-xl button-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const maxReply = 4000;

export function LessonComposer({
  session,
  voice,
  onSaved,
}: {
  session: TrainingSession;
  voice: ReturnType<typeof useSpeechLoop>;
  onSaved: (saved: boolean) => void;
}) {
  const { t } = useTranslation();
  const { busy, send, requestSupport } = useTrainingStore();
  const [reply, setReply] = useState("");
  const [speechDraft, setSpeechDraft] = useState<{ input: SpeechInput; recognized: string } | null>(
    null,
  );
  const [keyboard, setKeyboard] = useState<boolean | null>(null);
  const asrEnabled = voice.settings?.asr.enabled === true;
  const reviewing = voice.capture.phase === "review";
  const recording = voice.capture.phase === "recording";
  const dealingWithVoice = voice.capturing || reviewing;
  const textOpen = keyboard ?? !asrEnabled;
  const example = session.provider.mode === "demo" ? getGuidedExample(session) : undefined;
  const hints = session.state.courseTemplate?.teachingPolicy.maxHints ?? 3;
  const support = (request: DialogueSupport) => {
    voice.stopPlayback();
    void requestSupport(request).then(onSaved);
  };

  return (
    <form
      aria-label={t("training:focus.replyControls")}
      className="shrink-0 border-t border-line bg-surface"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || dealingWithVoice || !reply.trim()) return;
        voice.stopPlayback();
        const speech = speechDraft && {
          ...speechDraft.input,
          edited: speechDraft.input.edited || reply.trim() !== speechDraft.recognized,
        };
        void send(reply, speech ?? undefined).then((saved) => {
          if (saved) {
            setReply("");
            setSpeechDraft(null);
            voice.cancel();
          }
          onSaved(saved);
        });
      }}
    >
      <div className="mx-auto max-h-[50dvh] max-w-3xl space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4">
        <VoiceInput
          voice={voice}
          busy={busy}
          hasDraft={!!reply.trim()}
          remainingCharacters={maxReply - (reply.trim() ? reply.length + 1 : 0)}
          language={session.state.courseTemplate?.targetLanguage ?? "en"}
          onUse={(text, recognized, input) => {
            setReply((previous) => (previous.trim() ? `${previous}\n${text}` : text));
            setSpeechDraft({ input, recognized });
            setKeyboard(true);
          }}
        />
        <div
          id="lesson-keyboard"
          hidden={!textOpen}
          className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
        >
          <label className="min-w-0 grow basis-56 text-xs font-medium text-ink-muted">
            {t("training:yourReply")}
            <textarea
              className="form-control mt-1 block w-full resize-y rounded-lg border p-2.5 text-base"
              rows={2}
              maxLength={maxReply}
              value={reply}
              disabled={busy || dealingWithVoice}
              onChange={(event) => {
                setKeyboard(true);
                setReply(event.target.value);
                if (!event.target.value.trim()) setSpeechDraft(null);
              }}
            />
          </label>
          <button
            type="submit"
            className={primary}
            disabled={busy || dealingWithVoice || !reply.trim()}
          >
            {busy ? t("training:respondingAndSaving") : t("training:sendReply")}
          </button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-2">
          <button
            type="button"
            className={action}
            aria-controls="lesson-keyboard"
            aria-expanded={textOpen}
            disabled={voice.capturing}
            onClick={() => setKeyboard(!textOpen)}
          >
            {t("training:focus.keyboard")}
          </button>
          {recording ? (
            <button type="button" className={record} onClick={voice.stopRecording}>
              {t("speech:stopAndRecognize")}
            </button>
          ) : (
            <button
              type="button"
              className={record}
              disabled={busy || dealingWithVoice || !asrEnabled}
              onClick={voice.start}
            >
              {t("speech:recordReply")}
            </button>
          )}
          <button
            type="button"
            className="rounded-lg border border-warning-line bg-chat-hint px-3 py-2 text-sm font-semibold text-hint-ink enabled:hover:border-warning disabled:opacity-50"
            aria-label={t("training:giveMeAHint")}
            disabled={busy || dealingWithVoice || session.state.hintsGiven >= hints}
            onClick={() => support("hint")}
          >
            {t("training:focus.hint")}
          </button>
        </div>
        <div
          role="group"
          aria-label={t("training:practiceHelp")}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink"
        >
          {example && (
            <button
              type="button"
              className="py-1 underline underline-offset-2 disabled:opacity-50"
              disabled={busy || dealingWithVoice}
              onClick={() => {
                setReply(example);
                setSpeechDraft(null);
                setKeyboard(true);
              }}
            >
              {t("training:useSuggestedReply")}
            </button>
          )}
          <button
            type="button"
            className="py-1 underline underline-offset-2 disabled:opacity-50"
            disabled={busy || dealingWithVoice}
            onClick={() => support("repeat")}
          >
            {t("training:repeatLastReply")}
          </button>
          {session.provider.mode === "ai" && (
            <button
              type="button"
              className="py-1 underline underline-offset-2 disabled:opacity-50"
              disabled={busy || dealingWithVoice}
              onClick={() => support("simplify")}
            >
              {t("training:useSimplerEnglish")}
            </button>
          )}
          <p className="ml-auto text-ink-muted">
            {t("training:hintsUsed")}
            {formatNumber(session.state.hintsGiven)}/{formatNumber(hints)}
          </p>
        </div>
      </div>
    </form>
  );
}

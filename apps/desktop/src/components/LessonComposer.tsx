import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DialogueSupport, SpeechInput } from "@language-lab/core";
import { formatNumber } from "../i18n";
import { useTrainingStore } from "../stores/training";
import { getGuidedExample, type TrainingSession } from "../training/session";
import type { useSpeechLoop } from "../speech/useSpeechLoop";
import { VoiceInput } from "./VoiceInput";
import { VoiceMeaningConfirmation } from "./VoiceMeaningConfirmation";
import {
  findVoiceMeaningAmbiguities,
  rebaseVoiceMeaningAmbiguities,
  type VoiceMeaningAmbiguity,
} from "../conversation/voiceMeaning";
import { SpeakingHintButton, SpeakingHintCard } from "./SpeakingHint";
import { latestSpeakingHint } from "../practice/records";
import { useSpeakingHint } from "../practice/useSpeakingHint";
import { courseSpeakingHint } from "../practice/authored";

const shortcut = "button-secondary rounded-full px-3 py-1.5 font-semibold disabled:opacity-50";
const dockAction =
  "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-0.5 text-center text-xs font-semibold leading-tight text-ink disabled:opacity-50";
const circle = "grid size-10 place-items-center rounded-full border sm:size-12";
const recordCircle =
  "grid size-12 place-items-center rounded-full bg-record-action text-on-brand shadow-sm group-hover:bg-record-hover sm:size-14";
const primary = "rounded-xl button-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const maxReply = 4000;

export function LessonComposer({
  session,
  voice,
  lessonDetails,
  onSaved,
}: {
  session: TrainingSession;
  voice: ReturnType<typeof useSpeechLoop>;
  lessonDetails: ReactNode;
  onSaved: (saved: boolean) => void;
}) {
  const { t } = useTranslation();
  const { busy, turnStatus, send, requestSupport, requestSpeakingHint } = useTrainingStore();
  const [reply, setReply] = useState("");
  const [speechDraft, setSpeechDraft] = useState<{ input: SpeechInput; recognized: string } | null>(
    null,
  );
  const [ambiguities, setAmbiguities] = useState<VoiceMeaningAmbiguity[]>([]);
  const [showVoiceConfirmation, setShowVoiceConfirmation] = useState(false);
  const ambiguity = ambiguities[0];
  const [keyboard, setKeyboard] = useState<boolean | null>(null);
  const asrEnabled = voice.settings?.asr.enabled === true;
  const reviewing = voice.capture.phase === "review";
  const recording = voice.capture.phase === "recording";
  const dealingWithVoice = voice.capturing || reviewing;
  const textOpen = keyboard ?? !asrEnabled;
  const example = session.provider.mode === "demo" ? getGuidedExample(session) : undefined;
  const hints = session.state.courseTemplate?.teachingPolicy.maxHints ?? 3;
  const language = session.state.courseTemplate?.targetLanguage ?? "en";
  const anchorSeq = session.messages.length - 1;
  const hint = useSpeakingHint(
    `${session.id}:${anchorSeq}`,
    latestSpeakingHint(session.speakingPractice, anchorSeq),
    (signal) => requestSpeakingHint(session, ambiguity ? "" : reply, signal),
  );
  const canHint = session.provider.mode === "ai" || !!courseSpeakingHint(session, reply, example);
  const support = (request: DialogueSupport) => {
    if (useTrainingStore.getState().busy) return;
    hint.cancel();
    voice.stopPlayback();
    void requestSupport(request).then(onSaved);
  };
  function canSend(text: string) {
    return (
      !useTrainingStore.getState().busy &&
      !dealingWithVoice &&
      !!text.trim() &&
      text.trim().length <= maxReply
    );
  }

  function sendReply(text: string) {
    hint.cancel();
    voice.stopPlayback();
    const speech = speechDraft && {
      ...speechDraft.input,
      edited: speechDraft.input.edited || text.trim() !== speechDraft.recognized,
    };
    void send(text, speech ?? undefined).then((saved) => {
      if (saved) {
        setReply("");
        setSpeechDraft(null);
        setAmbiguities([]);
        voice.cancel();
      }
      onSaved(saved);
    });
  }

  function confirmVoiceMeaning(text: string) {
    if (!canSend(text)) return;
    const remaining = rebaseVoiceMeaningAmbiguities(reply, text, ambiguities.slice(1));
    setReply(text);
    setAmbiguities(remaining);
    if (remaining.length) return;
    setShowVoiceConfirmation(false);
    sendReply(text);
  }

  return (
    <form
      aria-label={t("training:focus.replyControls")}
      className="relative shrink-0 rounded-t-3xl border-t border-line bg-surface"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend(reply)) return;
        if (ambiguity) {
          setShowVoiceConfirmation(true);
          return;
        }
        sendReply(reply);
      }}
    >
      <div className="mx-auto flex max-h-[58dvh] max-w-4xl flex-col gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
        <div
          role="group"
          aria-label={t("training:practiceHelp")}
          className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-ink"
        >
          {lessonDetails}
          {example && (
            <button
              type="button"
              className={shortcut}
              disabled={busy || dealingWithVoice}
              onClick={() => {
                setReply(example);
                setSpeechDraft(null);
                setAmbiguities([]);
                setShowVoiceConfirmation(false);
                setKeyboard(true);
              }}
            >
              {t("training:useSuggestedReply")}
            </button>
          )}
          <button
            type="button"
            className={shortcut}
            disabled={busy || dealingWithVoice}
            onClick={() => support("repeat")}
          >
            {t("training:repeatLastReply")}
          </button>
          {session.provider.mode === "ai" && (
            <button
              type="button"
              className={shortcut}
              disabled={busy || dealingWithVoice}
              onClick={() => support("simplify")}
            >
              {t("training:useSimplerEnglish")}
            </button>
          )}
          <button
            type="button"
            className={shortcut}
            disabled={busy || dealingWithVoice || session.state.hintsGiven >= hints}
            onClick={() => support("hint")}
          >
            {t("training:giveMeAHint")}
          </button>
          <p className="ml-auto text-ink-muted">
            {t("training:hintsUsed")}
            {formatNumber(session.state.hintsGiven)}/{formatNumber(hints)}
          </p>
        </div>
        <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-0.5">
          <SpeakingHintCard
            hint={hint}
            language={language}
            onRead={voice.speak}
            readDisabled={voice.capturing || !voice.settings || voice.settings.tts.mode === "off"}
          />
          <VoiceInput
            voice={voice}
            busy={busy}
            language={session.state.courseTemplate?.targetLanguage ?? "en"}
            onUse={(text, recognized, input) => {
              const prefix = reply.trim() ? `${reply}\n` : "";
              const checks = /^en(?:-|$)/i.test(language)
                ? findVoiceMeaningAmbiguities(text, input.confidence)
                : [];
              setReply(prefix + text);
              setAmbiguities([
                ...ambiguities,
                ...checks.map((check) => ({ ...check, start: check.start + prefix.length })),
              ]);
              setShowVoiceConfirmation(false);
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
                  setAmbiguities(
                    rebaseVoiceMeaningAmbiguities(reply, event.target.value, ambiguities),
                  );
                  setReply(event.target.value);
                  if (!event.target.value.trim()) setSpeechDraft(null);
                }}
              />
            </label>
            <button
              type="submit"
              className={primary}
              disabled={busy || !canSend(reply) || (showVoiceConfirmation && !!ambiguity)}
            >
              {turnStatus === "responding" || turnStatus === "saving"
                ? t(`training:turnStatus.${turnStatus}`)
                : t("training:sendReply")}
            </button>
          </div>
          {showVoiceConfirmation && ambiguity && (
            <VoiceMeaningConfirmation
              draft={reply}
              ambiguity={ambiguity}
              canSend={canSend}
              onChoose={confirmVoiceMeaning}
            />
          )}
        </div>
        <div className="mx-auto grid w-full max-w-sm shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-start gap-2 pt-1">
          <button
            type="button"
            className={dockAction}
            aria-controls="lesson-keyboard"
            aria-expanded={textOpen}
            disabled={voice.capturing}
            onClick={() => setKeyboard(!textOpen)}
          >
            <span
              className={`${circle} border-line-strong bg-surface-secondary group-hover:bg-surface-hover group-aria-expanded:border-line-info group-aria-expanded:bg-brand-primary-soft group-aria-expanded:text-brand-ink`}
            >
              <span className="lesson-icon lesson-icon-keyboard" aria-hidden="true" />
            </span>
            <span>{t("training:focus.keyboard")}</span>
          </button>
          {recording ? (
            <button type="button" className={dockAction} onClick={voice.stopRecording}>
              <span className={recordCircle}>
                <span className="lesson-icon lesson-icon-stop" aria-hidden="true" />
              </span>
              <span>{t("speech:stopAndRecognize")}</span>
            </button>
          ) : (
            <button
              type="button"
              className={dockAction}
              disabled={busy || dealingWithVoice || !asrEnabled}
              onClick={voice.start}
            >
              <span className={recordCircle}>
                <span className="lesson-icon lesson-icon-mic" aria-hidden="true" />
              </span>
              <span>{t("speech:recordReply")}</span>
            </button>
          )}
          <SpeakingHintButton
            hint={hint}
            className={dockAction}
            disabled={!canHint || busy || dealingWithVoice || turnStatus === "saveFailed"}
          />
        </div>
      </div>
    </form>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceStyle } from "@language-lab/core";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { trainingGateway } from "../training/gateway";
import type { TrainingProvider } from "../training/provider";
import { authoredSpeakingExercise, checkAuthoredSpeaking } from "../practice/authored";
import { assessSpeaking, generateSpeakingTask } from "../practice/generation";
import {
  successfulTransfer,
  type SpeakingHintRecord,
  type SpeakingTransfer,
} from "../practice/records";
import { VoiceInput } from "./VoiceInput";
import { LocalizedError } from "./LocalizedError";

const secondary = "button-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50";
const primary = "button-primary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50";

type SaveTransfer = (
  next: SpeakingTransfer,
  previous: SpeakingTransfer | undefined,
  signal: AbortSignal,
) => Promise<boolean>;

export function SpeakingTransferControl({
  disabled,
  language,
  provider,
  voiceStyle,
  resolveSource,
  save,
  onActive,
}: {
  disabled: boolean;
  language: string;
  provider: TrainingProvider;
  voiceStyle?: VoiceStyle;
  resolveSource: () => Promise<{ hint?: SpeakingHintRecord; originalPrompt?: string }>;
  save: SaveTransfer;
  onActive?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<{ hint: SpeakingHintRecord; item: SpeakingTransfer }>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function start() {
    if (request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    onActive?.(true);
    setStarting(true);
    setError(false);
    let opened = false;
    try {
      const { hint, originalPrompt } = await resolveSource();
      controller.signal.throwIfAborted();
      if (hint?.answer?.assessment.result !== "met") throw new Error("No completed expression");
      const authored = authoredSpeakingExercise(hint.authoredId);
      let item = hint.transfer;
      if (!item) {
        const task =
          authored?.transfer ??
          (provider.mode === "ai"
            ? await generateSpeakingTask(
                await trainingGateway(provider),
                {
                  language,
                  originalPrompt: originalPrompt?.slice(0, 800),
                  hint: { intent: hint.intent, example: hint.example },
                },
                controller.signal,
              )
            : undefined);
        if (!task) throw new Error("No transfer task is available");
        controller.signal.throwIfAborted();
        item = {
          id: crypto.randomUUID(),
          task,
          source: authored ? "authored" : "ai",
          attempts: [],
        };
        if (!(await save(item, undefined, controller.signal)))
          throw new Error("Could not save task");
      }
      if (!controller.signal.aborted) {
        setOpen({ hint, item });
        opened = true;
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setStarting(false);
      if (!opened && !controller.signal.aborted) onActive?.(false);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        className={secondary}
        disabled={disabled || starting}
        onClick={() => void start()}
      >
        {t("training:speakingPractice.transfer")}
      </button>
      {starting && (
        <p role="status" className="text-sm">
          {t("training:speakingPractice.loadingTransfer")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {t("training:speakingPractice.transferFailed")}
        </p>
      )}
      {open && (
        <SpeakingTransferDialog
          hint={open.hint}
          initial={open.item}
          language={language}
          provider={provider}
          voiceStyle={voiceStyle}
          save={save}
          onClose={() => {
            setOpen(undefined);
            onActive?.(false);
          }}
        />
      )}
    </div>
  );
}

function SpeakingTransferDialog({
  hint,
  initial,
  language,
  provider,
  voiceStyle,
  save,
  onClose,
}: {
  hint: SpeakingHintRecord;
  initial: SpeakingTransfer;
  language: string;
  provider: TrainingProvider;
  voiceStyle?: VoiceStyle;
  save: SaveTransfer;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [item, setItem] = useState(initial);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "error" | null>(null);
  const voice = useSpeechLoop(item.id, language, voiceStyle);
  const capturing = voice.capturing || voice.capture.phase === "review";
  const lastAttempt = item.attempts.at(-1);
  const completed = successfulTransfer(item);
  const busy = status === "loading";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      pending.current?.abort();
      element?.close();
    };
  }, []);

  async function update(
    calculate: (signal: AbortSignal) => Promise<SpeakingTransfer>,
    saved?: () => void,
  ) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus("loading");
    try {
      const next = await calculate(controller.signal);
      controller.signal.throwIfAborted();
      if (!(await save(next, item, controller.signal))) throw new Error("Could not save practice");
      if (!controller.signal.aborted) {
        setItem(next);
        setStatus(null);
        saved?.();
      }
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      pending.current = null;
    }
  }

  function send() {
    const reply = draft.trim();
    if (!reply || capturing || completed) return;
    voice.stopPlayback();
    void update(
      async (signal) => {
        const assessment =
          provider.mode === "demo"
            ? checkAuthoredSpeaking(hint, reply, true)
            : await assessSpeaking(
                await trainingGateway(provider),
                item.task.criterion,
                reply,
                signal,
              );
        return {
          ...item,
          attempts: [
            ...item.attempts.slice(-9),
            {
              id: crypto.randomUUID(),
              reply,
              assessment,
              assisted: item.exampleShownAt !== undefined,
              at: Math.max(Date.now(), item.exampleShownAt ?? 0, lastAttempt?.at ?? 0),
            },
          ],
        };
      },
      () => setDraft(""),
    );
  }

  const outcome =
    lastAttempt?.assessment.result === "met"
      ? lastAttempt.assisted
        ? "assisted"
        : "independent"
      : lastAttempt?.assessment.result;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
      className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-ink/35"
    >
      <h2 id={heading} className="text-lg font-semibold">
        {t("training:speakingPractice.transfer")}
      </h2>
      <p lang={language} className="my-3 rounded-xl bg-brand-primary-subtle p-3 wrap-break-word">
        {item.task.situation}
      </p>
      <div className="space-y-3">
        {outcome && (
          <p role="status" className="font-semibold">
            {t(`training:speakingPractice.result.${outcome}`)}
          </p>
        )}
        {completed && (
          <p lang={language} className="wrap-break-word">
            {lastAttempt?.reply}
          </p>
        )}
        {busy && <p role="status">{t("training:speakingPractice.working")}</p>}
        {status === "error" && (
          <p role="alert" className="text-error-ink">
            {t("training:speakingPractice.transferFailed")}
          </p>
        )}
        {!completed && (
          <>
            {item.exampleShownAt === undefined ? (
              <button
                type="button"
                className={secondary}
                disabled={busy || capturing}
                onClick={() =>
                  void update(async () => ({
                    ...item,
                    exampleShownAt: Math.max(Date.now(), (lastAttempt?.at ?? 0) + 1),
                  }))
                }
              >
                {t("training:speakingPractice.hint")}
              </button>
            ) : (
              <div className="rounded-xl bg-chat-hint p-3 text-hint-ink">
                <p lang={language} className="wrap-break-word">
                  {item.task.example}
                </p>
                <button
                  type="button"
                  className={secondary}
                  disabled={capturing || !voice.settings || voice.settings.tts.mode === "off"}
                  onClick={() => voice.speak(item.task.example)}
                >
                  {t("training:speakingPractice.readExample")}
                </button>
              </div>
            )}
            {voice.capture.phase !== "idle" && (
              <VoiceInput
                voice={voice}
                busy={busy}
                language={language}
                onUse={(value) =>
                  setDraft((previous) =>
                    (previous.trim() ? previous + "\n" + value : value).slice(0, 4000),
                  )
                }
              />
            )}
            {voice.playback.error && (
              <p role="alert">
                <LocalizedError error={voice.playback.error} />
              </p>
            )}
            <label className="block text-sm font-medium">
              {t("training:yourReply")}
              <textarea
                className="form-control mt-1 block w-full resize-y rounded-xl border p-2"
                rows={2}
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={busy || capturing}
              />
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!completed && (
            <>
              {voice.settings?.asr.enabled && (
                <button
                  type="button"
                  className={secondary}
                  disabled={busy || (capturing && voice.capture.phase !== "recording")}
                  onClick={voice.capture.phase === "recording" ? voice.stopRecording : voice.start}
                >
                  {voice.capture.phase === "recording"
                    ? t("speech:stopAndRecognize")
                    : t("speech:recordReply")}
                </button>
              )}
              <button
                type="button"
                className={primary}
                disabled={busy || capturing || !draft.trim()}
                onClick={send}
              >
                {t("training:sendReply")}
              </button>
              <button
                type="button"
                className={secondary}
                disabled={busy}
                onClick={() =>
                  void update(async () => ({ ...item, skippedAt: Date.now() }), onClose)
                }
              >
                {t("training:speakingPractice.skip")}
              </button>
            </>
          )}
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>
            {t("training:speakingPractice.close")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

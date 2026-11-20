import { isGatewayError } from "@language-lab/model-gateway";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedError } from "../components/LocalizedError";
import { PartnerMessageActions } from "../components/PartnerMessageActions";
import { VoiceInput } from "../components/VoiceInput";
import {
  conversationMessages,
  freeConversationMessageLimit,
  type FreeConversationCheckpoint,
  type FreeConversationMessage,
} from "../conversation/checkpoint";
import { replyToConversation } from "../conversation/reply";
import {
  findVoiceMeaningAmbiguities,
  rebaseVoiceMeaningAmbiguities,
} from "../conversation/voiceMeaning";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { characterVoiceStyle } from "../speech/voices";
import { useAiProviderStore } from "../stores/aiProvider";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";
import { trainingGateway } from "../training/gateway";
import { toTrainingProvider } from "../training/provider";

const avatar = new URL("../assets/zoi-avatar.webp", import.meta.url).href;
const action =
  "button-secondary rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const inputControl =
  "group flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-0.5 text-center text-xs font-semibold text-ink disabled:opacity-50";

export function FreeConversationPage() {
  const { t } = useTranslation();
  const navigate = useNavStore((state) => state.navigate);
  const sourceId = useNavStore((state) => state.freeConversationId);
  const returnPage = useNavStore((state) => state.freeConversationReturnPage);
  const loadConversation = useTrainingStore((state) => state.loadFreeConversation);
  const saveConversation = useTrainingStore((state) => state.saveFreeConversation);
  const getMemory = useTrainingStore((state) => state.freeConversationMemory);
  const { settings, loaded, configured, busy: loadingAi, error, load } = useAiProviderStore();
  const [checkpoint, setCheckpoint] = useState<FreeConversationCheckpoint>(() => ({
    version: 1,
    id: `free-${crypto.randomUUID()}`,
    updatedAt: Date.now(),
    turns: [],
  }));
  const [sourceStatus, setSourceStatus] = useState<"ready" | "loading" | "failed">(
    sourceId ? "loading" : "ready",
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const draft = useNavStore((state) => state.freeConversationDraft);
  const ambiguities = useNavStore((state) => state.freeConversationAmbiguities);
  const setDraft = useNavStore((state) => state.setFreeConversationDraft);
  const [showVoiceConfirmation, setShowVoiceConfirmation] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failed, setFailed] = useState<"failed" | "invalidReply" | "saveFailed" | null>(null);
  const [saving, setSaving] = useState(false);
  const unsaved = useRef<FreeConversationCheckpoint | null>(null);
  const [keyboard, setKeyboard] = useState<boolean | null>(null);
  const [showSpeechSetup, setShowSpeechSetup] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const voiceConfirmationTitle = useRef<HTMLHeadingElement>(null);
  const voice = useSpeechLoop("free-conversation", "en", characterVoiceStyle());
  const partner = t("training:defaultPartnerName");
  const busy = pendingText !== null;
  const providerReady = configured && !loadingAi && !error;
  const ready = providerReady && sourceStatus === "ready";
  const asrEnabled = voice.settings?.asr.enabled === true;
  const reviewing = voice.capture.phase === "review";
  const dealingWithVoice = voice.capturing || reviewing;
  const recording = voice.capture.phase === "recording";
  const textOpen = keyboard ?? !asrEnabled;
  const playing = voice.playback.phase === "loading" || voice.playback.phase === "speaking";
  const messages = conversationMessages(checkpoint.turns);
  const visibleMessages: FreeConversationMessage[] = pendingText
    ? [...messages, { role: "user", content: pendingText }]
    : messages;
  const ambiguity = ambiguities[0];
  const alternative = ambiguity
    ? draft.slice(0, ambiguity.start) +
      ambiguity.alternative +
      draft.slice(ambiguity.start + ambiguity.heard.length)
    : null;

  useEffect(() => {
    void load();
    title.current?.focus();
    return () => pending.current?.abort();
  }, [load]);
  useEffect(() => {
    if (showVoiceConfirmation) voiceConfirmationTitle.current?.focus();
  }, [showVoiceConfirmation]);

  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    setSourceStatus("loading");
    void loadConversation(sourceId).then(
      (saved) => {
        if (!active) return;
        setCheckpoint(saved);
        setSourceStatus("ready");
      },
      () => {
        if (active) setSourceStatus("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [sourceId, loadAttempt, loadConversation]);

  useLayoutEffect(() => {
    const viewport = transcript.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, pendingText]);

  function canSend(text: string) {
    return (
      !!text.trim() &&
      text.trim().length <= freeConversationMessageLimit &&
      ready &&
      !pending.current &&
      !dealingWithVoice
    );
  }

  function requestSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend(draft)) return;
    if (ambiguity) {
      setShowVoiceConfirmation(true);
      return;
    }
    void sendReply(draft);
  }

  function confirmVoiceMeaning(text: string) {
    if (!canSend(text)) return;
    const remaining = rebaseVoiceMeaningAmbiguities(draft, text, ambiguities.slice(1));
    setDraft(text, remaining);
    if (remaining.length) {
      voiceConfirmationTitle.current?.focus();
      return;
    }
    setShowVoiceConfirmation(false);
    void sendReply(text);
  }

  async function sendReply(text: string) {
    const content = text.trim();
    const controller = new AbortController();
    const history: FreeConversationMessage[] = [...messages, { role: "user", content }];
    pending.current = controller;
    voice.stopPlayback();
    setPendingText(content);
    setFailed(null);
    let failure: "failed" | "saveFailed" = "saveFailed";
    try {
      let next = unsaved.current;
      if (next?.turns.at(-1)?.utterance !== content) {
        unsaved.current = null;
        const memory = await getMemory(content);
        if (controller.signal.aborted) return;
        failure = "failed";
        const gateway = await trainingGateway(toTrainingProvider(settings));
        if (controller.signal.aborted) return;
        const turn = await replyToConversation(gateway, history, controller.signal, memory);
        next = { ...checkpoint, updatedAt: Date.now(), turns: [...checkpoint.turns, turn] };
        unsaved.current = next;
      }
      if (controller.signal.aborted) return;
      failure = "saveFailed";
      setSaving(true);
      if (!(await saveConversation(next, controller.signal)))
        throw new Error("Could not save conversation");
      if (controller.signal.aborted) return;
      unsaved.current = null;
      setCheckpoint(next);
      setDraft("");
      if (voice.settings?.tts.autoRead) voice.speak(next.turns.at(-1)!.reply);
    } catch (error) {
      if (!controller.signal.aborted)
        setFailed(
          failure === "failed" && isGatewayError(error) && error.kind === "schema_violation"
            ? "invalidReply"
            : failure,
        );
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) {
        setPendingText(null);
        setSaving(false);
      }
    }
  }

  return (
    <section
      aria-labelledby="free-conversation-title"
      className="flex min-h-0 flex-1 flex-col bg-app"
    >
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <h1
            id="free-conversation-title"
            ref={title}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight"
          >
            {t("common:freeConversation.title")}
          </h1>
          <div className="flex flex-wrap gap-2">
            {playing && (
              <button type="button" className={action} onClick={voice.stopPlayback}>
                {t("training:stopPlayback")}
              </button>
            )}
            <button
              type="button"
              className={action}
              disabled={saving}
              onClick={() => navigate(returnPage)}
            >
              {t("common:freeConversation.close")}
            </button>
          </div>
        </div>
      </header>

      <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex w-fit items-center gap-4 rounded-3xl border border-line-info bg-brand-primary-subtle py-3 pr-8 pl-3 sm:py-4 sm:pl-4">
            <img
              src={avatar}
              alt=""
              width={64}
              height={64}
              className="teacher-avatar size-14 shrink-0 rounded-full object-cover sm:size-16"
            />
            <p className="font-semibold text-ink">{partner}</p>
          </div>
          {sourceStatus === "loading" && (
            <p role="status">{t("common:freeConversation.loadingHistory")}</p>
          )}
          {sourceStatus === "failed" && (
            <p role="alert" className="text-error-ink">
              {t("common:freeConversation.loadFailed")}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                {t("training:retry")}
              </button>
            </p>
          )}
          <ol
            hidden={sourceStatus !== "ready"}
            aria-label={t("training:conversation")}
            aria-live="polite"
            aria-relevant="additions"
            className="space-y-4"
          >
            {visibleMessages.map((message, index) => (
              <li
                key={index}
                className={`w-fit max-w-[92%] rounded-3xl px-4 py-3 sm:max-w-[78%] sm:px-5 ${message.role === "assistant" ? "rounded-tl-md bg-chat-ai text-chat-ai-ink" : "ml-auto rounded-tr-md bg-chat-user text-on-brand"}`}
              >
                <p className="mb-1 text-xs font-semibold">
                  {message.role === "assistant" ? partner : t("training:you")}
                </p>
                <p
                  lang="en"
                  className="text-base leading-relaxed whitespace-pre-wrap wrap-break-word sm:text-lg"
                >
                  {message.content}
                </p>
                {message.role === "assistant" && (
                  <PartnerMessageActions
                    text={message.content}
                    language="en"
                    messageNumber={index + 1}
                    readDisabled={
                      voice.capturing || !voice.settings || voice.settings.tts.mode === "off"
                    }
                    onRead={() => voice.speak(message.content)}
                  />
                )}
              </li>
            ))}
          </ol>
          {busy && (
            <p role="status" className="text-sm text-ink-muted">
              {t("common:freeConversation.responding")}
            </p>
          )}
          {voice.playback.error && (
            <p role="alert" className="text-sm text-error-ink">
              <LocalizedError error={voice.playback.error} />
            </p>
          )}
        </div>
      </div>

      <form
        aria-label={t("training:focus.replyControls")}
        className="shrink-0 rounded-t-3xl border-t border-line bg-surface"
        onSubmit={requestSend}
      >
        <div className="mx-auto flex max-h-[56dvh] max-w-4xl flex-col gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-0.5">
            {!providerReady && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                {error ? (
                  <button
                    type="button"
                    className="font-semibold text-brand-ink underline"
                    onClick={() => void load()}
                  >
                    {t("common:courseDesigner.reloadSettings")}
                  </button>
                ) : loadingAi || !loaded ? (
                  <p role="status">{t("common:courseDesigner.loadingSettings")}</p>
                ) : (
                  <>
                    <p>{t("common:freeConversation.needsConnection")}</p>
                    <button
                      type="button"
                      className="font-semibold text-brand-ink underline"
                      onClick={() => navigate("settings")}
                    >
                      {t("common:freeConversation.connect")}
                    </button>
                  </>
                )}
              </div>
            )}
            {ready && (
              <p className="text-xs text-ink-muted">
                {t("common:freeConversation.providerNotice")}
              </p>
            )}
            {failed && (
              <p role="alert" className="text-sm text-error-ink">
                {t(`common:freeConversation.${failed}`)}
              </p>
            )}
            {((loaded && !configured) || failed) && (
              <button type="button" className={action} onClick={() => navigate("guided")}>
                {t("training:openGuidedPractice")}
              </button>
            )}
            {failed && ready && (
              <button type="button" className={action} onClick={() => navigate("settings")}>
                {t("common:freeConversation.connect")}
              </button>
            )}
            {(showSpeechSetup || voice.capture.phase !== "idle") && (
              <VoiceInput
                voice={voice}
                busy={busy}
                language="en"
                onUse={(text, _recognized, speech) => {
                  const prefix = draft.trim() ? `${draft}\n` : "";
                  const checks = findVoiceMeaningAmbiguities(text, speech.confidence);
                  setDraft(prefix + text, [
                    ...ambiguities,
                    ...checks.map((check) => ({ ...check, start: check.start + prefix.length })),
                  ]);
                  setShowVoiceConfirmation(false);
                  setKeyboard(true);
                }}
              />
            )}
            <div
              id="free-conversation-keyboard"
              hidden={!textOpen}
              className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
            >
              <label className="min-w-0 grow basis-56 text-xs font-medium text-ink-muted">
                {t("training:yourReply")}
                <textarea
                  className="form-control mt-1 block w-full resize-y rounded-lg border p-2.5 text-base"
                  rows={2}
                  maxLength={freeConversationMessageLimit}
                  value={draft}
                  disabled={busy || dealingWithVoice}
                  onChange={(event) => {
                    setKeyboard(true);
                    const text = event.target.value;
                    setDraft(text, rebaseVoiceMeaningAmbiguities(draft, text, ambiguities));
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={!canSend(draft) || (showVoiceConfirmation && !!ambiguity)}
                className="button-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {t("training:sendReply")}
              </button>
            </div>
            {showVoiceConfirmation && alternative !== null && (
              <section
                aria-labelledby="free-conversation-voice-confirmation"
                className="space-y-2 rounded-xl border border-line-info bg-brand-primary-subtle p-3 text-sm"
              >
                <h2
                  id="free-conversation-voice-confirmation"
                  ref={voiceConfirmationTitle}
                  tabIndex={-1}
                  className="font-semibold"
                >
                  {t("common:freeConversation.voiceConfirmation.title")}
                </h2>
                <p>{t("common:freeConversation.voiceConfirmation.description")}</p>
                <div className="grid gap-2">
                  {[draft, alternative].map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      lang="en"
                      className="button-secondary wrap-break-word rounded-lg px-3 py-2 text-left whitespace-pre-wrap disabled:opacity-50"
                      disabled={!canSend(choice)}
                      onClick={() => confirmVoiceMeaning(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="mx-auto grid w-full max-w-xs shrink-0 grid-cols-2 items-center gap-3 pt-1">
            <button
              type="button"
              className={inputControl}
              aria-controls="free-conversation-keyboard"
              aria-expanded={textOpen}
              disabled={voice.capturing}
              onClick={() => setKeyboard(!textOpen)}
            >
              <span className="grid size-10 place-items-center rounded-full border border-line-strong bg-surface-secondary group-hover:bg-surface-hover group-aria-expanded:border-line-info group-aria-expanded:bg-brand-primary-soft sm:size-12">
                <span className="lesson-icon lesson-icon-keyboard" aria-hidden="true" />
              </span>
              {t("training:focus.keyboard")}
            </button>
            <button
              type="button"
              className={inputControl}
              disabled={busy || (dealingWithVoice && !recording)}
              onClick={() => {
                if (recording) voice.stopRecording();
                else if (asrEnabled) voice.start();
                else setShowSpeechSetup((visible) => !visible);
              }}
            >
              <span className="grid size-12 place-items-center rounded-full bg-record-action text-on-brand shadow-sm group-hover:bg-record-hover sm:size-14">
                <span
                  className={`lesson-icon ${recording ? "lesson-icon-stop" : "lesson-icon-mic"}`}
                  aria-hidden="true"
                />
              </span>
              {t(
                recording
                  ? "speech:stopAndRecognize"
                  : asrEnabled
                    ? "speech:recordReply"
                    : "common:freeConversation.microphoneSetup",
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

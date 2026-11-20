import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedError } from "../components/LocalizedError";
import { VoiceInput } from "../components/VoiceInput";
import {
  freeConversationGreeting,
  freeConversationMessageLimit,
  replyToConversation,
  type FreeConversationMessage,
} from "../conversation/reply";
import { formatNumber } from "../i18n";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { characterVoiceStyle } from "../speech/voices";
import { useAiProviderStore } from "../stores/aiProvider";
import { useNavStore } from "../stores/nav";
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
  const { settings, loaded, configured, busy: loadingAi, error, load } = useAiProviderStore();
  const [messages, setMessages] = useState<FreeConversationMessage[]>([
    { role: "assistant", content: freeConversationGreeting },
  ]);
  const draft = useNavStore((state) => state.freeConversationDraft);
  const setDraft = useNavStore((state) => state.setFreeConversationDraft);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [keyboard, setKeyboard] = useState<boolean | null>(null);
  const [showSpeechSetup, setShowSpeechSetup] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const voice = useSpeechLoop("free-conversation", "en", characterVoiceStyle());
  const partner = t("training:defaultPartnerName");
  const busy = pendingText !== null;
  const ready = configured && !loadingAi && !error;
  const asrEnabled = voice.settings?.asr.enabled === true;
  const reviewing = voice.capture.phase === "review";
  const dealingWithVoice = voice.capturing || reviewing;
  const recording = voice.capture.phase === "recording";
  const textOpen = keyboard ?? !asrEnabled;
  const playing = voice.playback.phase === "loading" || voice.playback.phase === "speaking";
  const visibleMessages: FreeConversationMessage[] = pendingText
    ? [...messages, { role: "user", content: pendingText }]
    : messages;

  useEffect(() => {
    void load();
    title.current?.focus();
    return () => pending.current?.abort();
  }, [load]);

  useLayoutEffect(() => {
    const viewport = transcript.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, pendingText]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (
      !content ||
      content.length > freeConversationMessageLimit ||
      !ready ||
      pending.current ||
      dealingWithVoice
    )
      return;
    const controller = new AbortController();
    const history: FreeConversationMessage[] = [...messages, { role: "user", content }];
    pending.current = controller;
    voice.stopPlayback();
    setPendingText(content);
    setFailed(false);
    try {
      const gateway = await trainingGateway(toTrainingProvider(settings));
      if (controller.signal.aborted) return;
      const reply = await replyToConversation(gateway, history, controller.signal);
      if (controller.signal.aborted) return;
      setMessages([...history, { role: "assistant", content: reply }]);
      setDraft("");
      if (voice.settings?.tts.autoRead) voice.speak(reply);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setPendingText(null);
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
            <button type="button" className={action} onClick={() => navigate("plan")}>
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
          <ol
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
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-8 items-center gap-2 rounded-full bg-surface px-3 text-xs font-semibold enabled:hover:bg-surface-hover disabled:opacity-50"
                    disabled={
                      voice.capturing || !voice.settings || voice.settings.tts.mode === "off"
                    }
                    onClick={() => voice.speak(message.content)}
                  >
                    <span className="lesson-icon lesson-icon-speaker" aria-hidden="true" />
                    <span>
                      {t("training:readMessage")}
                      <span className="sr-only"> {formatNumber(index + 1)}</span>
                    </span>
                  </button>
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
        onSubmit={(event) => void send(event)}
      >
        <div className="mx-auto flex max-h-[56dvh] max-w-4xl flex-col gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-0.5">
            {!ready && (
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
            {ready && messages.length === 1 && (
              <p className="text-xs text-ink-muted">
                {t("common:freeConversation.providerNotice")}
              </p>
            )}
            {failed && (
              <p role="alert" className="text-sm text-error-ink">
                {t("common:freeConversation.failed")}
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
                onUse={(text) => {
                  setDraft(draft.trim() ? `${draft}\n${text}` : text);
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
                    setDraft(event.target.value);
                  }}
                />
              </label>
              <button
                type="submit"
                disabled={!ready || busy || dealingWithVoice || !draft.trim()}
                className="button-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {t("training:sendReply")}
              </button>
            </div>
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

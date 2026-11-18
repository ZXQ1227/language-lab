import { LocalizedError } from "./LocalizedError";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useSpeechStore } from "../stores/speech";
import type { SpeechSettings as Settings } from "../speech/settings";

const control = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
function Editor({ saved }: { saved: Settings }) {
  const { t } = useTranslation();
  const { save, busy } = useSpeechStore();
  const [draft, setDraft] = useState(saved);
  const [keys, setKeys] = useState({ asr: "", tts: "" });
  const [savedMessage, setSavedMessage] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || !!keys.asr || !!keys.tts;
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft, keys).then((success) => {
          if (success) {
            setDraft(useSpeechStore.getState().settings!);
            setKeys({ asr: "", tts: "" });
            setSavedMessage(true);
          }
        });
      }}
    >
      <p className="text-sm text-slate-600">
        {t("speech:recognitionSendsYourRecordingToTheASREndpointYouEnable")}
      </p>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          disabled={busy}
          checked={draft.asr.enabled}
          onChange={(e) => setDraft({ ...draft, asr: { ...draft.asr, enabled: e.target.checked } })}
        />
        {t("speech:enableSpeechRecognition")}
      </label>
      {draft.asr.enabled && (
        <fieldset className="space-y-3" disabled={busy}>
          <label className="block text-sm">
            {t("speech:aSREndpoint")}
            <input
              className={control}
              type="url"
              required
              value={draft.asr.baseUrl}
              onChange={(e) =>
                setDraft({ ...draft, asr: { ...draft.asr, baseUrl: e.target.value } })
              }
            />
          </label>
          <label className="block text-sm">
            {t("speech:aSRModel")}
            <input
              className={control}
              required
              maxLength={120}
              value={draft.asr.model}
              onChange={(e) => setDraft({ ...draft, asr: { ...draft.asr, model: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            {t("speech:aSRAPIKeyLeaveBlankToKeepSavedKey")}
            <input
              className={control}
              type="password"
              autoComplete="off"
              value={keys.asr}
              onChange={(e) => setKeys({ ...keys, asr: e.target.value })}
            />
          </label>
        </fieldset>
      )}
      <label className="block text-sm">
        {t("speech:replyPlayback")}
        <select
          className={control}
          disabled={busy}
          value={draft.tts.mode}
          onChange={(e) =>
            setDraft({
              ...draft,
              tts: { ...draft.tts, mode: e.target.value as Settings["tts"]["mode"] },
            })
          }
        >
          <option value="off">{t("speech:off")}</option>
          <option value="system">{t("speech:deviceVoiceInstalledLocalVoices")}</option>
          <option value="provider">{t("speech:openAICompatibleTTSProvider")}</option>
        </select>
      </label>
      {draft.tts.mode === "provider" && (
        <fieldset className="space-y-3" disabled={busy}>
          <label className="block text-sm">
            {t("speech:tTSEndpoint")}
            <input
              className={control}
              type="url"
              required
              value={draft.tts.baseUrl}
              onChange={(e) =>
                setDraft({ ...draft, tts: { ...draft.tts, baseUrl: e.target.value } })
              }
            />
          </label>
          <label className="block text-sm">
            {t("speech:tTSModel")}
            <input
              className={control}
              required
              maxLength={120}
              value={draft.tts.model}
              onChange={(e) => setDraft({ ...draft, tts: { ...draft.tts, model: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            {t("speech:tTSVoice")}
            <input
              className={control}
              required
              maxLength={80}
              value={draft.tts.voice}
              onChange={(e) => setDraft({ ...draft, tts: { ...draft.tts, voice: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            {t("speech:tTSAPIKeyLeaveBlankToKeepSavedKey")}
            <input
              className={control}
              type="password"
              autoComplete="off"
              value={keys.tts}
              onChange={(e) => setKeys({ ...keys, tts: e.target.value })}
            />
          </label>
        </fieldset>
      )}
      {draft.tts.mode !== "off" && (
        <>
          <label className="block max-w-xs text-sm">
            {t("speech:playbackSpeed")}
            <select
              className={control}
              disabled={busy}
              value={draft.tts.rate}
              onChange={(e) =>
                setDraft({ ...draft, tts: { ...draft.tts, rate: Number(e.target.value) } })
              }
            >
              <option value={0.8}>{t("speech:slow08")}</option>
              <option value={1}>{t("speech:normal1")}</option>
              <option value={1.2}>{t("speech:fast12")}</option>
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.tts.autoRead}
              onChange={(e) =>
                setDraft({ ...draft, tts: { ...draft.tts, autoRead: e.target.checked } })
              }
            />
            {t("speech:readNewSavedPartnerRepliesAutomatically")}
          </label>
        </>
      )}
      <p className="text-xs text-slate-500">
        {t("speech:openAICompatibleAudioTranscriptionsAndAudioSpeechEndpointsHTTPIs")}
      </p>
      <p role="status" className="text-xs text-slate-500">
        {dirty ? t("speech:unsavedSpeechSettings") : savedMessage ? t("speech:savedOnDevice") : ""}
      </p>
      <button
        type="submit"
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
        disabled={busy}
      >
        {t("speech:saveSpeechSettings")}
      </button>
    </form>
  );
}
export function SpeechSettings() {
  const { t } = useTranslation();
  const { settings, busy, error, load } = useSpeechStore();
  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);
  return (
    <section
      aria-label={t("speech:speechSettings")}
      className="space-y-3 rounded border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("speech:speechInputAndPlayback")}</h2>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          <LocalizedError error={error} />{" "}
          {!settings && (
            <button className="ml-2 underline" disabled={busy} onClick={() => void load()}>
              {t("speech:retrySpeechSettings")}
            </button>
          )}
        </p>
      )}
      {!settings && !error && <p role="status">{t("speech:loadingSpeechSettings")}</p>}
      {settings && <Editor saved={settings} />}
    </section>
  );
}

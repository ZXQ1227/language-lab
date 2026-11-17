import { useEffect, useState } from "react";
import { useSpeechStore } from "../stores/speech";
import type { SpeechSettings as Settings } from "../speech/settings";

const control = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
function Editor({ saved }: { saved: Settings }) {
  const { save, busy } = useSpeechStore();
  const [draft, setDraft] = useState(saved);
  const [keys, setKeys] = useState({ asr: "", tts: "" });
  const [message, setMessage] = useState("");
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
            setMessage("Speech settings saved on this device.");
          }
        });
      }}
    >
      <p className="text-sm text-slate-600">
        Recognition sends your recording to the ASR endpoint you enable. Provider playback sends
        reply text to your TTS endpoint. Device playback uses installed local voices. Audio stays in
        memory and is not saved with lessons.
      </p>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          disabled={busy}
          checked={draft.asr.enabled}
          onChange={(e) => setDraft({ ...draft, asr: { ...draft.asr, enabled: e.target.checked } })}
        />
        Enable speech recognition
      </label>
      {draft.asr.enabled && (
        <fieldset className="space-y-3" disabled={busy}>
          <label className="block text-sm">
            ASR endpoint
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
            ASR model
            <input
              className={control}
              required
              maxLength={120}
              value={draft.asr.model}
              onChange={(e) => setDraft({ ...draft, asr: { ...draft.asr, model: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            ASR API key · leave blank to keep saved key
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
        Reply playback
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
          <option value="off">Off</option>
          <option value="system">Device voice · installed local voices</option>
          <option value="provider">OpenAI-compatible TTS provider</option>
        </select>
      </label>
      {draft.tts.mode === "provider" && (
        <fieldset className="space-y-3" disabled={busy}>
          <label className="block text-sm">
            TTS endpoint
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
            TTS model
            <input
              className={control}
              required
              maxLength={120}
              value={draft.tts.model}
              onChange={(e) => setDraft({ ...draft, tts: { ...draft.tts, model: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            TTS voice
            <input
              className={control}
              required
              maxLength={80}
              value={draft.tts.voice}
              onChange={(e) => setDraft({ ...draft, tts: { ...draft.tts, voice: e.target.value } })}
            />
          </label>
          <label className="block text-sm">
            TTS API key · leave blank to keep saved key
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
            Playback speed
            <select
              className={control}
              disabled={busy}
              value={draft.tts.rate}
              onChange={(e) =>
                setDraft({ ...draft, tts: { ...draft.tts, rate: Number(e.target.value) } })
              }
            >
              <option value={0.8}>Slow · 0.8×</option>
              <option value={1}>Normal · 1×</option>
              <option value={1.2}>Fast · 1.2×</option>
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
            Read new saved partner replies automatically
          </label>
        </>
      )}
      <p className="text-xs text-slate-500">
        OpenAI-compatible /audio/transcriptions and /audio/speech endpoints. HTTP is allowed only
        for localhost. API keys are kept in the OS keyring and are scoped separately to each
        endpoint.
      </p>
      <p role="status" className="text-xs text-slate-500">
        {dirty ? "Unsaved speech settings." : message}
      </p>
      <button
        type="submit"
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
        disabled={busy}
      >
        Save speech settings
      </button>
    </form>
  );
}
export function SpeechSettings() {
  const { settings, busy, error, load } = useSpeechStore();
  useEffect(() => {
    if (!settings) void load();
  }, [settings, load]);
  return (
    <section
      aria-label="Speech settings"
      className="space-y-3 rounded border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold">Speech input and playback</h2>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          {!settings && (
            <button className="ml-2 underline" disabled={busy} onClick={() => void load()}>
              Retry speech settings
            </button>
          )}
        </p>
      )}
      {!settings && !error && <p role="status">Loading speech settings…</p>}
      {settings && <Editor saved={settings} />}
    </section>
  );
}

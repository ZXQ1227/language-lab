import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiProviderStore } from "../stores/aiProvider";

const control = "mt-1 w-full rounded-md border form-control px-3 py-2 text-sm";

function Editor() {
  const { t } = useTranslation();
  const { settings, save, busy } = useAiProviderStore();
  const [draft, setDraft] = useState(settings);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings) || !!apiKey.trim();
  // Follow store updates (initial load) without remounting, so the saved
  // status message survives; user edits are never clobbered. `dirty` is read
  // at effect time on purpose: it guards, it does not trigger.
  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings]);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft, apiKey).then((success) => {
          if (success) {
            setDraft(useAiProviderStore.getState().settings);
            setApiKey("");
            setSaved(true);
          }
        });
      }}
    >
      <label className="block text-sm">
        {t("settings:aIEndpoint")}
        <input
          className={control}
          type="url"
          required
          value={draft.baseUrl}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t("settings:model")}
        <input
          className={control}
          required
          maxLength={120}
          value={draft.model}
          disabled={busy}
          onChange={(event) => setDraft({ ...draft, model: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t("settings:aPIKeyLeaveBlankToKeepSavedKey")}
        <input
          className={control}
          type="password"
          autoComplete="off"
          value={apiKey}
          disabled={busy}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <p className="text-xs text-ink-muted">
        {t("settings:useAnOpenAICompatibleEndpointAPIKeysAreSavedIn")}
      </p>
      <p role="status" className="text-xs text-ink-muted">
        {dirty ? t("settings:unsavedAIConnection") : saved ? t("settings:savedOnDevice") : ""}
      </p>
      <button
        type="submit"
        className="rounded button-primary px-3 py-2 text-sm disabled:opacity-40"
        disabled={busy}
      >
        {t("settings:saveAIConnection")}
      </button>
    </form>
  );
}

export function AiProviderSettings() {
  const { t } = useTranslation();
  const { settings, busy, error, load } = useAiProviderStore();
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section
      aria-label={t("settings:aIConnection")}
      className="space-y-3 rounded border border-line bg-surface p-5"
    >
      <h2 className="font-semibold">{t("settings:aIConnection")}</h2>
      <p className="text-sm text-ink-muted">
        {t("settings:aPIKeysAreStoredInTheOSKeyringThroughThe")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      )}
      {busy && !settings && (
        <p className="text-sm text-ink-muted">{t("settings:loadingAIConnection")}</p>
      )}
      <Editor />
    </section>
  );
}

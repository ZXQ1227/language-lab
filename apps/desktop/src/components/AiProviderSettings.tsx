import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiProviderStore } from "../stores/aiProvider";
import { aiProviderSettingsSchema } from "../training/provider";

const control = "mt-1 w-full rounded-md border form-control px-3 py-2 text-sm";

function Editor() {
  const { t } = useTranslation();
  const { settings, save, verify, configured, busy, connectionCheck, error } = useAiProviderStore();
  const [edit, setEdit] = useState<typeof settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [invalid, setInvalid] = useState(false);
  const draft = edit ?? settings;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings) || !!apiKey.trim();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = aiProviderSettingsSchema.safeParse(draft);
        setInvalid(!parsed.success);
        if (!parsed.success) return;
        void save(parsed.data, apiKey).then((success) => {
          if (success) {
            setEdit(null);
            setApiKey("");
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
          onChange={(event) => {
            setInvalid(false);
            setEdit({ ...draft, baseUrl: event.target.value });
          }}
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
          onChange={(event) => {
            setInvalid(false);
            setEdit({ ...draft, model: event.target.value });
          }}
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
        {dirty ? t("settings:unsavedAIConnection") : configured ? t("settings:savedOnDevice") : ""}
      </p>
      {invalid && (
        <p role="alert" className="text-sm text-error-ink">
          {t("settings:connection.invalidSettings")}
        </p>
      )}
      {configured && !dirty && !error && (
        <p
          role={connectionCheck.status === "failed" ? "alert" : "status"}
          className={
            connectionCheck.status === "failed"
              ? "text-sm text-error-ink"
              : "text-sm text-ink-muted"
          }
        >
          {connectionCheck.status === "failed"
            ? t(`settings:connection.failure.${connectionCheck.kind}`)
            : t(`settings:connection.${connectionCheck.status}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded button-primary px-3 py-2 text-sm disabled:opacity-40"
          disabled={busy}
        >
          {t("settings:saveAIConnection")}
        </button>
        <button
          type="button"
          className="rounded button-secondary px-3 py-2 text-sm disabled:opacity-40"
          disabled={busy || !configured || dirty || !!error}
          onClick={() => void verify()}
        >
          {t("settings:connection.test")}
        </button>
      </div>
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

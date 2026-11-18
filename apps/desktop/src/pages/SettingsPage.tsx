import { LocalizedError } from "../components/LocalizedError";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useSystemStore } from "../stores/system";
import { SpeechSettings } from "../components/SpeechSettings";
import { LocaleSettings } from "../components/LocaleSettings";

// System facts and speech configuration. Credentials use the OS keyring via
// the Rust core; conversation-model configuration stays with lesson setup.

export function SettingsPage() {
  const { t } = useTranslation();
  const { dbStatus, error, refresh } = useSystemStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label={t("settings:settings")} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("settings:settings")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("settings:systemStatusAndProviderConfiguration")}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {t("settings:couldNotReadSystemStatus")}
          <LocalizedError error={error} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("settings:database")}</h2>
        <p className="mt-2 break-all text-sm text-slate-600">
          {dbStatus ? (
            <>
              {t("settings:location")}
              <code className="rounded bg-slate-100 px-1">{dbStatus.path}</code>
            </>
          ) : (
            t("settings:unavailable")
          )}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("settings:aIProviders")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("settings:aPIKeysAreStoredInTheOSKeyringThroughThe")}
        </p>
      </div>
      <LocaleSettings />
      <SpeechSettings />
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { appLocales, canonicalLocale } from "../i18n/types";
import { useLocaleStore } from "../stores/locale";

export function LocaleSettings() {
  const { t } = useTranslation();
  const state = useLocaleStore();
  const busy = state.saving || state.loading || !state.preferenceLoaded;
  const systemName = (() => {
    try {
      const tag = canonicalLocale(state.systemLocale);
      return tag
        ? (new Intl.DisplayNames([state.appLocale], { type: "language" }).of(tag) ?? tag)
        : state.systemLocale;
    } catch {
      return state.systemLocale;
    }
  })();
  return (
    <section
      aria-label={t("common:locale.settings")}
      className="space-y-4 rounded border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold">{t("common:locale.heading")}</h2>
      <p className="text-sm text-slate-500">{t("common:locale.description")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.localeMode === "system"}
          disabled={busy}
          onChange={(event) =>
            void state.choose(
              event.target.checked
                ? { version: 1, localeMode: "system" }
                : { version: 1, localeMode: "manual", appLocale: state.appLocale },
            )
          }
        />
        {t("common:locale.followSystem")}
      </label>
      <label className="block max-w-xs text-sm">
        {t("common:locale.interfaceLanguage")}
        <select
          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2"
          value={state.appLocale}
          disabled={busy || state.localeMode === "system"}
          onChange={(event) =>
            void state.choose({
              version: 1,
              localeMode: "manual",
              appLocale: appLocales.find((locale) => locale === event.target.value)!,
            })
          }
        >
          {appLocales.map((locale) => (
            <option key={locale} value={locale}>
              {t(`common:locale.names.${locale}`)}
            </option>
          ))}
        </select>
      </label>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="inline font-medium">{t("common:locale.systemLanguage")}</dt>{" "}
          <dd className="inline">
            {systemName} <code>({state.systemLocale})</code>
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">{t("common:locale.currentLanguage")}</dt>{" "}
          <dd className="inline">{t(`common:locale.names.${state.appLocale}`)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{t("common:locale.region")}</dt>{" "}
          <dd className="inline">{state.regionLocale}</dd>
        </div>
      </dl>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`common:locale.errors.${state.error}`)}
          <button
            type="button"
            className="ml-2 underline"
            disabled={state.loading || state.saving}
            onClick={() => void state.initialize()}
          >
            {t("common:locale.retry")}
          </button>
        </p>
      )}
      <p role="status" className="text-xs text-slate-500">
        {state.saving
          ? t("common:locale.saving")
          : state.localeMode === "system"
            ? t("common:locale.systemActive")
            : t("common:locale.manualActive")}
      </p>
    </section>
  );
}

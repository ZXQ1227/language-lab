import { useTranslation } from "react-i18next";
import { AiProviderSettings } from "../components/AiProviderSettings";
import { LocaleSettings } from "../components/LocaleSettings";
import { SpeechSettings } from "../components/SpeechSettings";
import { SystemStatus } from "../components/SystemStatus";

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <section aria-label={t("settings:settings")} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t("settings:settings")}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t("settings:systemStatusAndProviderConfiguration")}
        </p>
      </div>
      <AiProviderSettings />
      <LocaleSettings />
      <SpeechSettings />
      <SystemStatus />
    </section>
  );
}

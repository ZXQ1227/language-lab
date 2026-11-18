import { useTranslation } from "react-i18next";
import { resources } from "../i18n/resources";

const errorKeys = new Map(
  Object.entries(resources["en-US"].common.errors).map(([key, message]) => [message, key]),
);
const errorCodes = new Set(Object.keys(resources["en-US"].common.errors));

/** Translate application messages at presentation time; retain external diagnostics verbatim. */
export function LocalizedError({ error }: { error: string | null | undefined }) {
  const { t } = useTranslation();
  if (!error) return null;
  if (error.startsWith("common:errors.") && errorCodes.has(error.slice("common:errors.".length))) {
    return <>{t(error)}</>;
  }
  const key = errorKeys.get(error);
  if (key) return <>{t(`common:errors.${key}`)}</>;
  const missingKey = /^Save an API key for this (ASR|TTS) endpoint in Settings first$/.exec(error);
  if (missingKey) return <>{t("common:errors.missingKey", { kind: missingKey[1] })}</>;
  const missingVoice =
    /^No installed device voice is available for (.+)\. Choose a TTS provider in Settings or use text\.$/.exec(
      error,
    );
  if (missingVoice) return <>{t("common:errors.missingVoice", { language: missingVoice[1] })}</>;
  return (
    <>
      {t("common:errors.unknown")}
      <span className="mt-1 block break-words text-xs">
        {t("common:errors.details")} <code>{error}</code>
      </span>
    </>
  );
}

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";
import { appLocales, regionalFormatLocale, type AppLocale } from "./types";

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: "en-US",
  fallbackLng: "en-US",
  supportedLngs: [...appLocales],
  defaultNS: "common",
  ns: Object.keys(resources["en-US"]),
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});
let regionLocale = "en-US";
export function applyInterfaceLocale(appLocale: AppLocale, systemRegion: string) {
  regionLocale = systemRegion;
  void i18n.changeLanguage(appLocale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = appLocale;
    document.documentElement.dir = i18n.dir(appLocale);
    document.title = i18n.t("common:languageLab");
  }
}
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(
    regionalFormatLocale((i18n.resolvedLanguage ?? "en-US") as AppLocale, regionLocale),
    options,
  ).format(value);
}
export function uiValue<T>(value: T): T | string {
  return typeof value === "number" ? formatNumber(value) : value;
}
export function formatDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return i18n.t("common:dateUnavailable");
  return new Intl.DateTimeFormat(
    regionalFormatLocale((i18n.resolvedLanguage ?? "en-US") as AppLocale, regionLocale),
    { dateStyle: "short", timeStyle: "medium" },
  ).format(date);
}

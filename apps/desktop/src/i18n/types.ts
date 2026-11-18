import { z } from "zod";

export const appLocales = ["zh-CN", "zh-TW", "en-US"] as const;
export const appLocaleSchema = z.enum(appLocales);
export type AppLocale = z.infer<typeof appLocaleSchema>;
export const localePreferenceSchema = z.discriminatedUnion("localeMode", [
  z.object({ version: z.literal(1), localeMode: z.literal("system") }),
  z.object({ version: z.literal(1), localeMode: z.literal("manual"), appLocale: appLocaleSchema }),
]);
export type LocalePreference = z.infer<typeof localePreferenceSchema>;
export interface LocaleSettings {
  systemLocale: string;
  regionLocale: string;
  appLocale: AppLocale;
  localeMode: "system" | "manual";
}
export const systemLocaleInfoSchema = z.object({
  systemLocale: z.string().min(1).max(128),
  regionLocale: z.string().min(1).max(128),
});

export function canonicalLocale(value: string): string | undefined {
  try {
    const tag = value.trim().split(/[.@]/)[0]!.replace(/_/g, "-");
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}
/** Script takes precedence over region; unsupported primary languages use English. */
export function resolveSystemLocale(value: string): AppLocale {
  const canonical = canonicalLocale(value);
  if (!canonical) return "en-US";
  const locale = new Intl.Locale(canonical);
  if (locale.language === "zh") {
    if (locale.script === "Hant") return "zh-TW";
    if (locale.script === "Hans") return "zh-CN";
    return ["TW", "HK", "MO"].includes(locale.region ?? "") ? "zh-TW" : "zh-CN";
  }
  return "en-US";
}
export function selectAppLocale(preference: LocalePreference, systemLocale: string): AppLocale {
  return preference.localeMode === "manual"
    ? preference.appLocale
    : resolveSystemLocale(systemLocale);
}
export function regionalFormatLocale(appLocale: AppLocale, regionLocale: string): string {
  const canonical = canonicalLocale(regionLocale);
  const region = canonical ? new Intl.Locale(canonical).region : undefined;
  return new Intl.Locale(appLocale, region ? { region } : {}).toString();
}

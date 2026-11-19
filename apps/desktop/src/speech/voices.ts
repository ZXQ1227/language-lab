import type { CourseTemplate, VoiceStyle } from "@language-lab/core";
import type { SpeechSettings } from "./settings";

type Character = Pick<NonNullable<CourseTemplate["character"]>, "name" | "voiceStyle">;
type VoiceSettings = SpeechSettings["tts"];

const knownCharacters = new Map<string, VoiceStyle>([
  ["zoi", "female"],
  ["maya", "female"],
  ["daniel", "male"],
]);

export function characterVoiceStyle(character?: Character): VoiceStyle | undefined {
  return (
    character?.voiceStyle ??
    knownCharacters.get(character?.name.normalize("NFKC").trim().toLowerCase() ?? "zoi")
  );
}

export function voiceMode(settings: VoiceSettings) {
  return settings.voiceMode ?? (settings.mode === "provider" ? "default" : "auto");
}

export function preferredVoiceStyle(
  settings: VoiceSettings,
  character: VoiceStyle | undefined,
): VoiceStyle | undefined {
  const mode = voiceMode(settings);
  if (mode === "auto") return character;
  if (mode === "female" || mode === "male") return mode;
  return undefined;
}

// Web Speech exposes names and URIs without a gender field. Match known
// installed identifiers and explicit labels on the local voices it returns.
const femaleVoice =
  /\b(?:female|allison|ava|helen|karen|kate|moira|samantha|susan|tessa|victoria|zira|hazel|shelley|jenny|aria|huihui|xiaoxiao|xiaoyi|yaoyao|ting[- ]?ting|mei[- ]?jia|sin[- ]?ji)\b|女[声聲]/i;
const maleVoice =
  /\b(?:male|alex|daniel|fred|lee|oliver|rishi|tom|david|mark|george|guy|ryan|yunxi|yunyang|yunfeng|kangkang|li[- ]?mu)\b|男[声聲]/i;

export function selectDeviceVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
  style?: VoiceStyle,
): SpeechSynthesisVoice | undefined {
  const locale = language.toLowerCase();
  const primary = locale.split("-")[0];
  const available = voices.filter(
    (voice) => voice.localService && voice.lang.toLowerCase().split("-")[0] === primary,
  );
  const exact = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase() === locale;
  const preferred = style
    ? available.filter((voice) => {
        const label = `${voice.name} ${voice.voiceURI ?? ""}`;
        return (style === "female" ? femaleVoice : maleVoice).test(label);
      })
    : [];
  return (
    preferred.find(exact) ??
    preferred[0] ??
    available.find((voice) => exact(voice) && voice.default) ??
    available.find(exact) ??
    available.find((voice) => voice.default) ??
    available[0]
  );
}

export function openAiRoleVoice(settings: VoiceSettings, style: VoiceStyle): string | undefined {
  if (
    settings.baseUrl === "https://api.openai.com/v1" &&
    /^(?:tts-1(?:-hd)?|gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?)$/.test(settings.model)
  ) {
    return style === "female" ? "nova" : "onyx";
  }
  return undefined;
}

export function selectProviderVoice(settings: VoiceSettings, style?: VoiceStyle): string {
  if (!style) return settings.voice;
  const configured = style === "female" ? settings.femaleVoice : settings.maleVoice;
  return configured ?? openAiRoleVoice(settings, style) ?? settings.voice;
}

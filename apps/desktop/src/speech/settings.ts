import { z } from "zod";
import {
  audioEndpointSchema,
  isLocalAudioEndpoint,
  OpenAiCompatibleAsrProvider,
  OpenAiCompatibleTtsProvider,
  type KeyName,
} from "@language-lab/model-gateway";
import { call } from "../lib/ipc";

const connection = z.object({
  baseUrl: audioEndpointSchema,
  model: z.string().trim().min(1).max(120),
});
export const speechSettingsSchema = z.object({
  version: z.literal(1),
  asr: connection.extend({ enabled: z.boolean() }),
  tts: connection.extend({
    mode: z.enum(["off", "system", "provider"]),
    voice: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    rate: z.number().min(0.5).max(1.5),
    autoRead: z.boolean(),
  }),
});
export type SpeechSettings = z.infer<typeof speechSettingsSchema>;
export const defaultSpeechSettings = (): SpeechSettings => ({
  version: 1,
  asr: { enabled: false, baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
  tts: {
    mode: "system",
    baseUrl: "https://api.openai.com/v1",
    model: "tts-1",
    voice: "alloy",
    rate: 1,
    autoRead: false,
  },
});

async function keyName(kind: "asr" | "tts", baseUrl: string): Promise<KeyName> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(baseUrl));
  return `${kind}.speech.${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
async function credentials(kind: "asr" | "tts", baseUrl: string) {
  const value = await call<string | null>("secrets_get", { name: await keyName(kind, baseUrl) });
  if (!value && !isLocalAudioEndpoint(baseUrl))
    throw new Error(`Save an API key for this ${kind.toUpperCase()} endpoint in Settings first`);
  return value ?? "";
}
export async function saveSpeechKeys(settings: SpeechSettings, keys: { asr: string; tts: string }) {
  for (const kind of ["asr", "tts"] as const) {
    const active = kind === "asr" ? settings.asr.enabled : settings.tts.mode === "provider";
    if (!active) continue;
    const baseUrl = settings[kind].baseUrl;
    if (keys[kind].trim())
      await call("secrets_set", { name: await keyName(kind, baseUrl), value: keys[kind].trim() });
    await credentials(kind, baseUrl);
  }
}
export async function speechAsr(settings: SpeechSettings) {
  const config = speechSettingsSchema.parse(settings);
  if (!config.asr.enabled) throw new Error("Enable speech recognition in Settings first");
  return new OpenAiCompatibleAsrProvider({
    ...config.asr,
    apiKey: await credentials("asr", config.asr.baseUrl),
  });
}
export async function speechTts(settings: SpeechSettings) {
  const config = speechSettingsSchema.parse(settings);
  if (config.tts.mode !== "provider") throw new Error("Choose provider speech in Settings first");
  return new OpenAiCompatibleTtsProvider(
    { ...config.tts, apiKey: await credentials("tts", config.tts.baseUrl) },
    config.tts.rate,
  );
}

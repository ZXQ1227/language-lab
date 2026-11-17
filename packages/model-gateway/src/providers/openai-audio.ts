import { z } from "zod";
import { GatewayError, kindForStatus, type GatewayErrorKind } from "../errors";
import type {
  AsrOptions,
  AsrProvider,
  AsrResult,
  CallOptions,
  HealthReport,
  TtsProvider,
  TtsResult,
} from "../types";

export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;
export const MAX_SPEECH_BYTES = 10 * 1024 * 1024;
export const audioEndpointSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && isLocalAudioEndpoint(value))) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Use HTTPS (or localhost HTTP), without credentials, query or fragment")
  .transform((value) => value.replace(/\/+$/, ""));
export function isLocalAudioEndpoint(value: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
}
const extensions: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
};
const transcriptSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  confidence: z.number().min(0).max(1).optional(),
});
export interface OpenAiAudioConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Deadlines cover headers AND streamed bodies. Errors never include provider bodies, keys or text. */
class AudioTransport {
  readonly baseUrl: string;
  readonly model: string;
  constructor(
    private readonly config: OpenAiAudioConfig,
    readonly id: string,
  ) {
    this.baseUrl = audioEndpointSchema.parse(config.baseUrl);
    this.model = z.string().trim().min(1).max(120).parse(config.model);
  }
  error(kind: GatewayErrorKind, message: string) {
    return new GatewayError({ kind, providerId: this.id, message });
  }
  async request<T>(
    path: string,
    init: RequestInit,
    limit: number,
    parse: (bytes: Uint8Array, mime: string) => T,
    options?: CallOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const external = options?.signal;
    const abort = () => controller.abort();
    if (external?.aborted) throw this.error("cancelled", "Speech request cancelled");
    external?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      options?.timeoutMs ?? this.config.timeoutMs ?? 45000,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await (this.config.fetchImpl ?? globalThis.fetch)(`${this.baseUrl}${path}`, {
        ...init,
        redirect: "error",
        signal: controller.signal,
        headers: {
          ...init.headers,
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new GatewayError({
          kind: kindForStatus(response.status),
          providerId: this.id,
          statusCode: response.status,
          message: `Speech provider returned HTTP ${response.status}`,
        });
      }
      if (Number(response.headers.get("content-length")) > limit)
        throw this.error("invalid_request", "Speech response exceeds the size limit");
      if (!response.body)
        throw this.error("provider_error", "Speech provider returned an empty response");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (controller.signal.aborted)
          throw this.error(timedOut ? "timeout" : "cancelled", "Speech request stopped");
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit)
          throw this.error("invalid_request", "Speech response exceeds the size limit");
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return parse(
        bytes,
        (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(),
      );
    } catch (error) {
      if (timedOut) throw this.error("timeout", "Speech request timed out; try again");
      if (external?.aborted) throw this.error("cancelled", "Speech request cancelled");
      if (error instanceof GatewayError) throw error;
      throw this.error(
        "network",
        "Could not reach the speech provider. Check the connection and endpoint access.",
      );
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", abort);
      controller.abort();
      await reader?.cancel().catch(() => undefined);
    }
  }
  async healthCheck(options?: CallOptions): Promise<HealthReport> {
    try {
      await this.request("/models", { method: "GET" }, 256 * 1024, () => undefined, {
        ...options,
        timeoutMs: options?.timeoutMs ?? 5000,
      });
      return { ok: true, detail: "Endpoint reachable; audio model support is checked on use" };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof GatewayError ? error.message : "Speech endpoint unavailable",
      };
    }
  }
}

export class OpenAiCompatibleAsrProvider implements AsrProvider {
  readonly id: string;
  private readonly transport: AudioTransport;
  constructor(config: OpenAiAudioConfig) {
    this.id = `openai-asr:${config.model}`;
    this.transport = new AudioTransport(config, this.id);
  }
  async transcribe(audio: Uint8Array, mimeType: string, options?: AsrOptions): Promise<AsrResult> {
    const mime = mimeType.split(";")[0]!.trim().toLowerCase();
    const extension = extensions[mime];
    if (!extension || !audio.length || audio.length > MAX_RECORDING_BYTES)
      throw this.transport.error(
        "invalid_request",
        "Record supported audio between 1 byte and 5 MB",
      );
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      `recording.${extension}`,
    );
    form.append("model", this.transport.model);
    form.append("response_format", "json");
    if (options?.language)
      form.append(
        "language",
        z
          .string()
          .regex(/^[a-z]{2,3}$/)
          .parse(options.language),
      );
    return this.transport.request(
      "/audio/transcriptions",
      { method: "POST", body: form },
      64 * 1024,
      (bytes) => {
        const result = transcriptSchema.safeParse(
          (() => {
            try {
              return JSON.parse(new TextDecoder().decode(bytes));
            } catch {
              return null;
            }
          })(),
        );
        if (!result.success)
          throw this.transport.error(
            "schema_violation",
            "No usable transcript returned. Try recording again or type your reply.",
          );
        return result.data;
      },
      options,
    );
  }
  healthCheck(options?: CallOptions) {
    return this.transport.healthCheck(options);
  }
}

export class OpenAiCompatibleTtsProvider implements TtsProvider {
  readonly id: string;
  private readonly transport: AudioTransport;
  constructor(
    config: OpenAiAudioConfig,
    private readonly rate = 1,
  ) {
    this.id = `openai-tts:${config.model}`;
    this.transport = new AudioTransport(config, this.id);
  }
  async synthesize(text: string, voice = "alloy", options?: CallOptions): Promise<TtsResult> {
    if (
      !text.trim() ||
      text.length > 4000 ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(voice) ||
      !Number.isFinite(this.rate) ||
      this.rate < 0.5 ||
      this.rate > 1.5
    )
      throw this.transport.error(
        "invalid_request",
        "Use up to 4000 characters and a supported voice/rate",
      );
    return this.transport.request(
      "/audio/speech",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.transport.model,
          input: text,
          voice,
          response_format: "mp3",
          speed: this.rate,
        }),
      },
      MAX_SPEECH_BYTES,
      (audio, mimeType) => {
        const mp3 =
          audio.length >= 3 &&
          ((audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) ||
            (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0));
        if (!["audio/mpeg", "audio/mp3"].includes(mimeType) || !mp3)
          throw this.transport.error(
            "schema_violation",
            "Speech provider did not return supported MP3 audio",
          );
        return { audio, mimeType: "audio/mpeg" };
      },
      options,
    );
  }
  healthCheck(options?: CallOptions) {
    return this.transport.healthCheck(options);
  }
}

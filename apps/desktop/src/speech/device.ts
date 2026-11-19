import {
  GatewayError,
  type AsrOptions,
  type AsrProvider,
  type AsrResult,
  type CallOptions,
  type HealthReport,
} from "@language-lab/model-gateway";
import { call } from "../lib/ipc";

interface DeviceTranscription {
  readonly text: string;
  readonly confidence?: number;
}

/** Normalizes IPC failures into the actionable message produced by the native layer. */
function deviceError(error: unknown): GatewayError {
  const cause =
    error instanceof Error && "cause" in error ? (error as { cause?: unknown }).cause : error;
  const detail =
    typeof cause === "string" ? cause : cause instanceof Error ? cause.message : String(error);
  return new GatewayError({ kind: "provider_error", providerId: "device-asr", message: detail });
}

/**
 * Recognizes speech with the OS built-in recognizer (macOS Speech framework).
 * No API key, no endpoint: audio is handed to the native layer, which prefers
 * on-device models and never persists the recording. Audio for the lesson is
 * only processed while a recognition request is running.
 */
export class DeviceAsrProvider implements AsrProvider {
  readonly id = "device-asr:macos-speech";
  async transcribe(audio: Uint8Array, mimeType: string, options?: AsrOptions): Promise<AsrResult> {
    let result: DeviceTranscription;
    try {
      result = await call<DeviceTranscription>("speech_transcribe_device", {
        audio: Array.from(audio),
        mimeType,
        language: options?.language ?? null,
      });
    } catch (error) {
      throw deviceError(error);
    }
    if (!result.text.trim())
      throw new GatewayError({
        kind: "provider_error",
        providerId: "device-asr",
        message: "No speech was recognized in the recording. Record again, or type your reply.",
      });
    return {
      text: result.text,
      confidence: typeof result.confidence === "number" ? result.confidence : undefined,
    };
  }
  async healthCheck(options?: CallOptions): Promise<HealthReport> {
    void options;
    return {
      ok: true,
      detail: "Uses the built-in device speech recognizer; no endpoint required",
    };
  }
}

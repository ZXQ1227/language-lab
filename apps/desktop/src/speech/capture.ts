import { z } from "zod";
import { GatewayError, MAX_RECORDING_BYTES, type AsrProvider } from "@language-lab/model-gateway";

export const MAX_RECORDING_MS = 45000;
export type CaptureState = {
  phase: "idle" | "requesting" | "recording" | "recognizing" | "review" | "error";
  text?: string;
  confidence?: number;
  providerId?: string;
  error?: string;
  canRetry?: boolean;
};
const resultSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  confidence: z.number().min(0).max(1).optional(),
});
/**
 * Negotiation order matters: macOS WKWebView happily records webm/opus, but
 * the Apple Speech recognizer used by device mode only decodes MP4/AAC
 * containers. Prefer audio/mp4 so both device recognition and OpenAI-
 * compatible endpoints receive audio they can decode.
 */
export const RECORDING_FORMATS = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
] as const;

/** One in-memory recording. All asynchronous callbacks are invalidated on cancel/dispose. */
export class SpeechCapture {
  private generation = 0;
  private disposed = false;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private recording?: Blob;
  private state: CaptureState = { phase: "idle" };
  constructor(
    private readonly provider: () => Promise<AsrProvider>,
    private readonly language: string,
    private readonly update: (state: CaptureState) => void,
  ) {}
  private change(state: CaptureState) {
    this.state = state;
    if (!this.disposed) this.update(state);
  }
  private stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
  cancel() {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    clearTimeout(this.timer);
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      try {
        if (this.recorder.state !== "inactive") this.recorder.stop();
      } catch {
        /* Tracks still close if the recorder is already stopping. */
      }
      this.recorder = undefined;
    }
    this.stopTracks();
    this.recording = undefined;
    this.change({ phase: "idle" });
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
  async start() {
    if (this.disposed) return;
    this.cancel();
    const generation = this.generation;
    this.change({ phase: "requesting" });
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (generation !== this.generation || this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mimeType = RECORDING_FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation || !event.data.size) return;
        size += event.data.size;
        if (size > MAX_RECORDING_BYTES) {
          this.cancel();
          this.change({
            phase: "error",
            error: "Recording reached the 5 MB limit. Record a shorter reply.",
          });
          return;
        }
        chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation === this.generation) {
          this.cancel();
          this.change({
            phase: "error",
            error: "Recording failed. Check the microphone and try again, or type your reply.",
          });
        }
      };
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.timer);
        this.stopTracks();
        this.recorder = undefined;
        this.recording = new Blob(chunks, {
          type: chunks[0]?.type || recorder.mimeType || mimeType,
        });
        if (!this.recording.size) {
          this.recording = undefined;
          this.change({ phase: "error", error: "No audio was captured. Try recording again." });
          return;
        }
        void this.recognize(generation);
      };
      recorder.start(250);
      this.change({ phase: "recording" });
      this.timer = setTimeout(() => this.stop(), MAX_RECORDING_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel();
      const permission =
        error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name);
      this.change({
        phase: "error",
        error: permission
          ? "Microphone access was denied. Enable it in system/browser settings, or type your reply."
          : "Microphone recording is unavailable. Check the device and recording support, or type your reply.",
      });
    }
  }
  stop() {
    if (this.recorder?.state === "recording") {
      clearTimeout(this.timer);
      this.recorder.stop();
      this.stopTracks();
    }
  }
  retry() {
    if (this.recording && this.state.phase === "error") void this.recognize(this.generation);
  }
  private async recognize(generation: number) {
    const recording = this.recording;
    if (!recording || this.disposed) return;
    this.change({ phase: "recognizing" });
    const abort = new AbortController();
    this.abort = abort;
    try {
      const provider = await this.provider();
      const audio = new Uint8Array(await recording.arrayBuffer());
      if (generation !== this.generation || this.disposed) return;
      const result = resultSchema.parse(
        await provider.transcribe(audio, recording.type, {
          signal: abort.signal,
          language: this.language.split("-")[0]!.toLowerCase(),
        }),
      );
      if (generation !== this.generation || this.disposed) return;
      this.recording = undefined;
      this.change({
        phase: "review",
        text: result.text,
        confidence: result.confidence,
        providerId: provider.id,
      });
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      const message =
        error instanceof GatewayError
          ? error.message
          : error instanceof Error && error.message.startsWith("Save an API key")
            ? error.message
            : "Speech recognition failed. Retry recognition, record again, or type your reply.";
      this.change({ phase: "error", error: message, canRetry: true });
    } finally {
      if (this.abort === abort) this.abort = undefined;
    }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsrProvider } from "@language-lab/model-gateway";
import {
  MAX_RECORDING_MS,
  SpeechCapture,
  type CaptureState,
} from "../../../apps/desktop/src/speech/capture";

const stopped = vi.fn();
const stream = { getTracks: () => [{ stop: stopped }] } as unknown as MediaStream;
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = (mime: string) => mime === "audio/mp4";
  state = "inactive";
  mimeType: string;
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, config?: MediaRecorderOptions) {
    this.mimeType = config?.mimeType ?? "audio/webm";
    Recorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.emit(new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }));
    this.onstop?.();
  }
  emit(data: Blob) {
    this.ondataavailable?.({ data } as BlobEvent);
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function setup(
  transcribe = vi.fn<AsrProvider["transcribe"]>().mockResolvedValue({ text: "A latte, please." }),
) {
  const states: CaptureState[] = [];
  const capture = new SpeechCapture(
    async () => ({ id: "test-asr", transcribe, healthCheck: async () => ({ ok: true }) }),
    "en-GB",
    (s) => states.push(s),
  );
  return { capture, states, transcribe };
}
beforeEach(() => {
  stopped.mockClear();
  Recorder.instances = [];
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("microphone lifecycle", () => {
  it("negotiates MP4, releases tracks and returns a reviewable transcript without submitting anything", async () => {
    const { capture, states, transcribe } = setup();
    await capture.start();
    expect(states.at(-1)?.phase).toBe("recording");
    capture.stop();
    await tick();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "audio/mp4",
      expect.objectContaining({ language: "en", signal: expect.any(AbortSignal) }),
    );
    expect(states.at(-1)).toEqual({
      phase: "review",
      text: "A latte, please.",
      confidence: undefined,
      providerId: "test-asr",
    });
    capture.retry();
    expect(transcribe).toHaveBeenCalledTimes(1);
    capture.dispose();
  });
  it("closes a microphone permission result that arrives after cancellation", async () => {
    let resolve!: (stream: MediaStream) => void;
    navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { capture, states, transcribe } = setup();
    const pending = capture.start();
    capture.cancel();
    resolve(stream);
    await pending;
    expect(stopped).toHaveBeenCalledOnce();
    expect(Recorder.instances).toHaveLength(0);
    expect(states.at(-1)?.phase).toBe("idle");
    expect(transcribe).not.toHaveBeenCalled();
  });
  it("aborts recognition and ignores late provider results after navigation", async () => {
    let resolve!: (result: { text: string }) => void;
    const transcribe = vi.fn<AsrProvider["transcribe"]>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { capture, states } = setup(transcribe);
    await capture.start();
    capture.stop();
    await tick();
    capture.dispose();
    const count = states.length;
    expect(transcribe.mock.calls[0]![2]!.signal!.aborted).toBe(true);
    resolve({ text: "late words" });
    await tick();
    expect(states).toHaveLength(count);
    expect(states.some((s) => s.phase === "review")).toBe(false);
  });
  it("keeps failed recognition audio only for an explicit retry and clears it on cancel", async () => {
    const transcribe = vi
      .fn<AsrProvider["transcribe"]>()
      .mockRejectedValueOnce(new Error("private provider details"))
      .mockResolvedValueOnce({ text: "Hello", confidence: 0.5 });
    const { capture, states } = setup(transcribe);
    await capture.start();
    capture.stop();
    await tick();
    expect(states.at(-1)).toMatchObject({ phase: "error", canRetry: true });
    expect(states.at(-1)?.error).not.toContain("private provider");
    capture.retry();
    await tick();
    expect(states.at(-1)).toMatchObject({ phase: "review", text: "Hello", confidence: 0.5 });
    capture.cancel();
    capture.retry();
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
  it("stops automatically at the duration limit and rejects oversized recordings", async () => {
    vi.useFakeTimers();
    const first = setup();
    await first.capture.start();
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS);
    expect(first.states.at(-1)?.phase).toBe("review");
    expect(stopped).toHaveBeenCalledOnce();
    first.capture.dispose();
    const second = setup();
    await second.capture.start();
    Recorder.instances.at(-1)!.emit(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]));
    expect(second.states.at(-1)?.error).toContain("5 MB");
    expect(second.transcribe).not.toHaveBeenCalled();
    expect(stopped).toHaveBeenCalledTimes(2);
  });
  it("reports denied or unsupported capture without leaving an active recorder", async () => {
    navigator.mediaDevices.getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const { capture, states } = setup();
    await capture.start();
    expect(states.at(-1)?.error).toContain("denied");
    vi.stubGlobal("MediaRecorder", undefined);
    await capture.start();
    expect(states.at(-1)?.error).toContain("unavailable");
    expect(Recorder.instances).toHaveLength(0);
  });
});

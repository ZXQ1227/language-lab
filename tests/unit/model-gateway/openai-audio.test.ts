import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioEndpointSchema,
  MAX_RECORDING_BYTES,
  OpenAiCompatibleAsrProvider,
  OpenAiCompatibleTtsProvider,
} from "@language-lab/model-gateway";

afterEach(() => vi.useRealTimers());
const config = {
  baseUrl: "http://localhost:9191/v1",
  model: "speech-test",
  apiKey: "test-private-key",
};
const bytes = new Uint8Array([0x49, 0x44, 0x33, 0]);
describe("OpenAI-compatible audio providers", () => {
  it("uploads the negotiated recording container with model/language and validates the transcript", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: "  A latte, please.  ", confidence: 0.64 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const asr = new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: fetcher });
    expect(await asr.transcribe(bytes, "audio/mp4", { language: "en" })).toEqual({
      text: "A latte, please.",
      confidence: 0.64,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${config.baseUrl}/audio/transcriptions`);
    expect(init!.headers).toEqual({ authorization: `Bearer ${config.apiKey}` });
    expect(init!.redirect).toBe("error");
    const form = init!.body as FormData;
    expect(form.get("model")).toBe("speech-test");
    expect(form.get("language")).toBe("en");
    expect((form.get("file") as File).name).toBe("recording.m4a");
    expect((form.get("file") as File).type).toBe("audio/mp4");
    expect(new Uint8Array(await (form.get("file") as File).arrayBuffer())).toEqual(bytes);
  });
  it("does not invent confidence and rejects empty, oversized, malformed and unsupported recordings/results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"text":"hello"}'))
      .mockResolvedValueOnce(new Response('{"text":""}'))
      .mockResolvedValueOnce(new Response('{"text":"hello","confidence":4}'))
      .mockResolvedValueOnce(new Response("not json"));
    const asr = new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: fetcher });
    expect(await asr.transcribe(bytes, "audio/webm;codecs=opus")).toEqual({ text: "hello" });
    for (let i = 0; i < 3; i++)
      await expect(asr.transcribe(bytes, "audio/webm")).rejects.toMatchObject({
        kind: "schema_violation",
      });
    await expect(asr.transcribe(new Uint8Array(), "audio/wav")).rejects.toMatchObject({
      kind: "invalid_request",
    });
    await expect(
      asr.transcribe(new Uint8Array(MAX_RECORDING_BYTES + 1), "audio/wav"),
    ).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(asr.transcribe(bytes, "text/plain")).rejects.toMatchObject({
      kind: "invalid_request",
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("sends TTS text, voice and speed and validates the MP3 response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes, { headers: { "content-type": "audio/mpeg" } }));
    const tts = new OpenAiCompatibleTtsProvider({ ...config, fetchImpl: fetcher }, 0.8);
    expect(await tts.synthesize("Welcome back", "alloy")).toEqual({
      audio: bytes,
      mimeType: "audio/mpeg",
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      model: "speech-test",
      input: "Welcome back",
      voice: "alloy",
      speed: 0.8,
      response_format: "mp3",
    });
    expect(fetcher.mock.calls[0]![0]).toBe(`${config.baseUrl}/audio/speech`);
  });
  it("rejects bad TTS types, content and lengths before playback", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"error":"not audio"}', { headers: { "content-type": "audio/mpeg" } }),
      )
      .mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "text/plain" } }))
      .mockResolvedValueOnce(
        new Response(bytes, {
          headers: { "content-type": "audio/mpeg", "content-length": "999999999" },
        }),
      );
    const tts = new OpenAiCompatibleTtsProvider({ ...config, fetchImpl: fetcher });
    for (let i = 0; i < 2; i++)
      await expect(tts.synthesize("hello")).rejects.toMatchObject({ kind: "schema_violation" });
    await expect(tts.synthesize("hello")).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(tts.synthesize("x".repeat(4001))).rejects.toMatchObject({
      kind: "invalid_request",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([401, 429, 500])(
    "returns a sanitized HTTP %i error without provider bodies or secrets",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(`private recording text ${config.apiKey}`, { status }));
      const asr = new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: fetcher });
      const error = await asr.transcribe(bytes, "audio/wav").catch((e: unknown) => e);
      expect(error).toMatchObject({
        statusCode: status,
        message: `Speech provider returned HTTP ${status}`,
      });
      expect(JSON.stringify(error)).not.toContain(config.apiKey);
      expect(JSON.stringify(error)).not.toContain("private recording");
    },
  );
  it("honors already-aborted calls without uploading audio", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const asr = new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: fetcher });
    const abort = new AbortController();
    abort.abort();
    await expect(
      asr.transcribe(bytes, "audio/wav", { signal: abort.signal }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps the deadline active while waiting for the response body and bounds chunked responses", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener(
                "abort",
                () => controller.error(new DOMException("aborted", "AbortError")),
                { once: true },
              );
            },
          }),
        ),
    );
    const asr = new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: fetcher });
    const waiting = expect(
      asr.transcribe(bytes, "audio/wav", { timeoutMs: 100 }),
    ).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await waiting;
    const chunked = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(65 * 1024)));
    await expect(
      new OpenAiCompatibleAsrProvider({ ...config, fetchImpl: chunked }).transcribe(
        bytes,
        "audio/wav",
      ),
    ).rejects.toMatchObject({ kind: "invalid_request" });
  });
  it("rejects insecure or credential-bearing endpoints and treats reachability as different from model support", async () => {
    for (const url of [
      "not a URL",
      "http://example.com/v1",
      "https://key:secret@example.com/v1",
      "https://example.com/v1?api_key=secret",
      "https://example.com/#secret",
    ])
      expect(audioEndpointSchema.safeParse(url).success).toBe(false);
    expect(audioEndpointSchema.parse("http://localhost:9191/v1/")).toBe(config.baseUrl);
    const asr = new OpenAiCompatibleAsrProvider({
      ...config,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")),
    });
    expect(await asr.healthCheck()).toMatchObject({
      ok: true,
      detail: expect.stringContaining("audio model support"),
    });
  });
});

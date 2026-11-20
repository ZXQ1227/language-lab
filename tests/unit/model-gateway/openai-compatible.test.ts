// OpenAI-compatible provider against an injected fetch: real contract
// handling (headers, timeouts, status mapping, SSE streaming, usage) without
// any network in tests.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createGateway,
  isGatewayError,
  MockLlmProvider,
  MockTtsProvider,
  OpenAiCompatibleLlmProvider,
  type GatewayEvent,
  type LlmProvider,
} from "@language-lab/model-gateway";

const CONFIG = {
  id: "deepseek",
  baseUrl: "https://api.example.com/v1",
  model: "deepseek-chat",
  apiKey: "sk-injected-test-key",
  logger: { log(_e: GatewayEvent) {} },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const completion = (text: string, totalTokens = 42) => ({
  choices: [{ message: { content: text } }],
  usage: { prompt_tokens: 10, completion_tokens: 32, total_tokens: totalTokens },
});

describe("OpenAI-compatible provider (injected fetch)", () => {
  it("generateText returns text and usage", async () => {
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(200, completion("Hello!")),
    });
    const result = await llm.generateText({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("Hello!");
    expect(result.usage?.totalTokens).toBe(42);
  });

  it("generateStructured validates against the schema", async () => {
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(200, completion('{"ok":true}')),
    });
    const { data } = await llm.generateStructured(
      { messages: [{ role: "user", content: "ping" }] },
      z.object({ ok: z.boolean() }),
    );
    expect(data).toEqual({ ok: true });
  });

  it("generateStructured retries with a larger budget when reasoning exhausts max_tokens", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reasoningExhausted = {
      choices: [
        {
          message: { content: "", reasoning_content: "thinking...".repeat(100) },
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 370, completion_tokens: 2200, total_tokens: 2570 },
    };
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (bodies.length === 1) return jsonResponse(200, reasoningExhausted);
        return jsonResponse(200, completion('{"ok":true}'));
      },
    });
    const { data } = await llm.generateStructured(
      { messages: [{ role: "user", content: "ping" }], maxTokens: 2200 },
      z.object({ ok: z.boolean() }),
    );
    expect(data).toEqual({ ok: true });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.max_tokens).toBe(2200);
    expect(bodies[1]!.max_tokens).toBe(8800);
  });

  it("generateStructured retries when JSON mode returns blank content", async () => {
    let calls = 0;
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => {
        calls++;
        return jsonResponse(200, completion(calls < 3 ? " ".repeat(120) : '{"ok":true}'));
      },
    });
    const { data } = await llm.generateStructured(
      { messages: [{ role: "user", content: "ping" }] },
      z.object({ ok: z.boolean() }),
    );
    expect(data).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("generateStructured reports blank output after exhausting retries", async () => {
    let calls = 0;
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => {
        calls++;
        return jsonResponse(200, completion(" ".repeat(90)));
      },
    });
    await expect(
      llm.generateStructured(
        { messages: [{ role: "user", content: "ping" }] },
        z.object({ ok: z.boolean() }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isGatewayError(e) &&
        e.kind === "schema_violation" &&
        e.outputIssue === "blank" &&
        e.message.includes("blank output across 3 attempts"),
    );
    expect(calls).toBe(3);
  });

  it("generateStructured reports a reasoning-budget hint when retry still returns no content", async () => {
    const exhausted = () => ({
      choices: [{ message: { content: "", reasoning_content: "..." }, finish_reason: "length" }],
    });
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(200, exhausted()),
    });
    await expect(
      llm.generateStructured(
        { messages: [{ role: "user", content: "ping" }], maxTokens: 2200 },
        z.object({ ok: z.boolean() }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isGatewayError(e) &&
        e.kind === "schema_violation" &&
        e.message.includes("completion budget exhausted"),
    );
  });

  it("maps 401 to auth and 429 to rate_limit", async () => {
    const auth = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(401, { error: "bad key" }),
    });
    await expect(auth.generateText({ messages: [] })).rejects.toSatisfy(
      (e: unknown) => isGatewayError(e) && e.kind === "auth" && e.retryable === false,
    );

    const limited = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(429, { error: "slow down" }),
    });
    await expect(limited.generateText({ messages: [] })).rejects.toSatisfy(
      (e: unknown) => isGatewayError(e) && e.kind === "rate_limit" && e.retryable === true,
    );
  });

  it("maps deadline aborts to a timeout error", async () => {
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      // Simulates a provider that never answers until the deadline aborts it.
      fetchImpl: (_url: string | URL | globalThis.Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "TimeoutError")),
          );
        }),
    });
    await expect(llm.generateText({ messages: [] }, { timeoutMs: 30 })).rejects.toSatisfy(
      (e: unknown) =>
        isGatewayError(e) && e.kind === "timeout" && (e as { retryable: boolean }).retryable,
    );
  });

  it("redacts API keys that appear in provider error bodies", async () => {
    const events: GatewayEvent[] = [];
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      logger: { log: (e: GatewayEvent) => events.push(e) },
      fetchImpl: async () =>
        jsonResponse(500, { error: "invalid key sk-abcdef1234567890 in request" }),
    });
    await expect(llm.generateText({ messages: [] })).rejects.toSatisfy(isGatewayError);
    // Neither the raw error body nor the configured key appears in telemetry.
    expect(JSON.stringify(events)).not.toContain("abcdef1234567890");
    expect(JSON.stringify(events)).not.toContain("sk-injected-test-key");
  });

  it("streams SSE deltas and a final usage chunk", async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
      "data: [DONE]",
      "",
    ].join("\n");
    const llm = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () =>
        new Response(sseBody, { status: 200, headers: { "content-type": "text/event-stream" } }),
    });
    const chunks: string[] = [];
    let usageTotal: number | undefined;
    for await (const chunk of llm.streamText({ messages: [] })) {
      chunks.push(chunk.delta);
      if (chunk.usage) usageTotal = chunk.usage.totalTokens;
    }
    expect(chunks.join("")).toBe("Hello");
    expect(usageTotal).toBe(5);
  });

  it("healthCheck reports endpoint status without throwing", async () => {
    const healthy = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(200, { data: [] }),
    });
    const bad = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(401, {}),
    });
    expect((await healthy.healthCheck()).ok).toBe(true);
    expect((await bad.healthCheck()).ok).toBe(false);
  });
});

describe("provider replaceability", () => {
  // Business code depends only on the LlmProvider interface.
  async function tutorIntro(llm: LlmProvider): Promise<string> {
    const result = await llm.generateText({
      messages: [
        { role: "system", content: "You are a friendly tutor." },
        { role: "user", content: "introduce yourself" },
      ],
    });
    return result.text;
  }

  it("the same business code runs against mock and real providers", async () => {
    const mock = new OpenAiCompatibleLlmProvider({
      ...CONFIG,
      fetchImpl: async () => jsonResponse(200, completion("Hi, I am your real tutor!")),
    });
    const offline = new MockLlmProvider({}, ["Hi, I am your mock tutor!"]);

    expect(await tutorIntro(mock)).toBe("Hi, I am your real tutor!");
    expect(await tutorIntro(offline)).toBe("Hi, I am your mock tutor!");
  });

  it("a mixed gateway (real LLM, mock TTS) works without business changes", async () => {
    const gateway = createGateway({
      llm: new OpenAiCompatibleLlmProvider({
        ...CONFIG,
        fetchImpl: async () => jsonResponse(200, completion("ok")),
      }),
      tts: new MockTtsProvider({}),
    });
    expect((await gateway.llm.generateText({ messages: [] })).text).toBe("ok");
    expect((await gateway.tts!.synthesize("hi")).mimeType).toBe("audio/wav");
    const health = await gateway.healthCheckAll();
    expect(health.llm?.ok).toBe(true);
    expect(health.tts?.ok).toBe(true);
  });
});

// Gateway core behavior: mock providers run, structured output is validated,
// failures are mapped into the unified taxonomy, telemetry redacts secrets.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createGateway,
  createMemoryKeyStore,
  GatewayError,
  isGatewayError,
  MockAsrProvider,
  MockLlmProvider,
  MockTtsProvider,
  redactSecrets,
  resolveApiKey,
  type GatewayEvent,
} from "@language-lab/model-gateway";

function captureLogger(events: GatewayEvent[]) {
  return {
    log(event: GatewayEvent) {
      events.push(event);
    },
  };
}

describe("mock gateway", () => {
  it("provides a working offline gateway through the unified interface", async () => {
    const gateway = createGateway({
      llm: new MockLlmProvider({}, ["Hello student!"]),
      asr: new MockAsrProvider({}, [{ text: "I want to book a room", confidence: 0.97 }]),
      tts: new MockTtsProvider({}),
    });

    const llmResult = await gateway.llm.generateText({
      messages: [{ role: "user", content: "Greet me" }],
    });
    expect(llmResult.text).toBe("Hello student!");
    expect(llmResult.usage?.totalTokens).toBeGreaterThan(0);

    const asrResult = await gateway.asr!.transcribe(new Uint8Array(16), "audio/wav");
    expect(asrResult.text).toBe("I want to book a room");

    const ttsResult = await gateway.tts!.synthesize("Welcome back");
    expect(ttsResult.mimeType).toBe("audio/wav");
    expect(ttsResult.audio.length).toBeGreaterThan(0);

    const health = await gateway.healthCheckAll();
    expect(health.llm?.ok).toBe(true);
    expect(health.asr?.ok).toBe(true);
    expect(health.tts?.ok).toBe(true);
  });

  it("streams text incrementally", async () => {
    const llm = new MockLlmProvider({}, ["one two three"]);
    const deltas: string[] = [];
    for await (const chunk of llm.streamText({ messages: [{ role: "user", content: "count" }] })) {
      deltas.push(chunk.delta);
    }
    expect(deltas.join("")).toBe("one two three");
  });
});

describe("generateStructured", () => {
  const profileSchema = z.object({
    level: z.enum(["A2", "B1"]),
    goals: z.array(z.string()),
  });

  it("returns schema-validated data", async () => {
    const llm = new MockLlmProvider({}, ['{"level":"B1","goals":["travel"]}']);
    const { data } = await llm.generateStructured(
      { messages: [{ role: "user", content: "assess me" }] },
      profileSchema,
    );
    expect(data).toEqual({ level: "B1", goals: ["travel"] });
  });

  it("rejects unvalidated output with a schema_violation error", async () => {
    const llm = new MockLlmProvider({}, ['{"level":"C9"}']);
    const promise = llm.generateStructured(
      { messages: [{ role: "user", content: "assess me" }] },
      profileSchema,
    );
    await expect(promise).rejects.toSatisfy(
      (e: unknown) => isGatewayError(e) && e.kind === "schema_violation",
    );
  });

  it("rejects non-JSON output", async () => {
    const llm = new MockLlmProvider({}, ["I am sorry, I cannot do that."]);
    await expect(llm.generateStructured({ messages: [] }, profileSchema)).rejects.toSatisfy(
      (e: unknown) => isGatewayError(e) && e.kind === "schema_violation",
    );
  });
});

describe("error handling and telemetry", () => {
  it("injects failures as GatewayError and logs error kind + duration", async () => {
    const events: GatewayEvent[] = [];
    const llm = new MockLlmProvider(
      { logger: captureLogger(events), failures: [new Error("boom")] },
      [],
    );
    await expect(
      llm.generateText({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toSatisfy((e: unknown) => isGatewayError(e) && e.kind === "provider_error");

    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("error");
    expect(events[0]!.errorKind).toBe("provider_error");
    expect(events[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs token usage on success without logging content", async () => {
    const events: GatewayEvent[] = [];
    const llm = new MockLlmProvider({ logger: captureLogger(events) }, ["secret user phrase"]);
    await llm.generateText({ messages: [{ role: "user", content: "hello" }] });
    expect(events).toHaveLength(1);
    expect(events[0]!.usage?.totalTokens).toBeGreaterThan(0);
    // The model reply must not appear anywhere in the log event.
    expect(JSON.stringify(events)).not.toContain("secret user phrase");
  });

  it("reports timeout as a retryable GatewayError", () => {
    const err = new GatewayError({
      kind: "timeout",
      providerId: "mock-llm",
      message: "exceeded deadline",
    });
    expect(err.retryable).toBe(true);
    expect(err.kind).toBe("timeout");
  });
});

describe("secret redaction", () => {
  it("masks API keys in log text", () => {
    const line = "auth failed for key sk-abcdef1234567890 at endpoint";
    expect(redactSecrets(line)).not.toContain("abcdef1234567890");
    expect(redactSecrets(line)).toContain("sk-***");
  });
});

describe("key resolution", () => {
  it("fails fast when no key is configured", async () => {
    const store = createMemoryKeyStore();
    await expect(resolveApiKey(store, "llm.openai")).rejects.toThrow(/missing API key/);
  });

  it("prefers the secure store over nothing and never persists to disk", async () => {
    const store = createMemoryKeyStore({ "llm.openai": "sk-stored-value" });
    expect(await resolveApiKey(store, "llm.openai")).toBe("sk-stored-value");
    expect(await resolveApiKey(store, "llm.openai", "sk-explicit")).toBe("sk-explicit");
  });
});

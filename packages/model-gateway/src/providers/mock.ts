// Mock providers: fully functional offline implementations of the unified
// interfaces. Used for tests, UI development and as the default gateway
// before the user configures a real provider.

import type { z } from "zod";
import { GatewayError } from "../errors";
import { RequestTracker, type GatewayLogger } from "../telemetry";
import type {
  AsrProvider,
  AsrResult,
  CallOptions,
  ChatMessage,
  HealthReport,
  LlmProvider,
  LlmRequest,
  LlmStreamChunk,
  LlmTextResult,
  TokenUsage,
  TtsProvider,
  TtsResult,
} from "../types";

interface MockBaseConfig {
  readonly logger?: GatewayLogger;
  /** Queue of errors to throw on the next calls (test failure injection). */
  readonly failures?: unknown[];
}

function nextFailure(failures: unknown[] | undefined): unknown | undefined {
  return failures?.shift();
}

function estimateTokens(messages: readonly ChatMessage[], text: string): TokenUsage {
  const prompt = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const completion = Math.ceil(text.length / 4);
  return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
}

export class MockLlmProvider implements LlmProvider {
  readonly id = "mock-llm";
  private readonly scripted: string[];

  constructor(
    private readonly config: MockBaseConfig = {},
    scripted: string[] = ["This is a mock reply."],
  ) {
    this.scripted = [...scripted];
  }

  /** Pushes a canned reply onto the response queue. */
  enqueue(reply: string): void {
    this.scripted.push(reply);
  }

  async generateText(request: LlmRequest, options?: CallOptions): Promise<LlmTextResult> {
    const tracker = new RequestTracker(
      this.config.logger ?? silentLogger,
      options?.requestId ?? mockRequestId(),
      this.id,
      "llm.generateText",
    );
    const failure = nextFailure(this.config.failures);
    if (failure !== undefined) tracker.fail(failure, options?.requestId ?? "n/a");
    const text = this.scripted.shift() ?? "This is a mock reply.";
    const usage = estimateTokens(request.messages, text);
    tracker.ok(options?.requestId ?? "n/a", usage);
    return { text, usage };
  }

  async generateStructured<T>(
    request: LlmRequest,
    schema: z.ZodType<T>,
    options?: CallOptions,
  ): Promise<{ data: T; usage?: TokenUsage }> {
    const tracker = new RequestTracker(
      this.config.logger ?? silentLogger,
      options?.requestId ?? mockRequestId(),
      this.id,
      "llm.generateStructured",
    );
    const failure = nextFailure(this.config.failures);
    if (failure !== undefined) tracker.fail(failure, options?.requestId ?? "n/a");
    const raw = this.scripted.shift() ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw tracker.fail(
        new GatewayError({
          kind: "schema_violation",
          providerId: this.id,
          message: "mock returned non-JSON output",
        }),
        options?.requestId ?? "n/a",
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw tracker.fail(
        new GatewayError({
          kind: "schema_violation",
          providerId: this.id,
          message: `schema violation: ${result.error.message}`,
        }),
        options?.requestId ?? "n/a",
      );
    }
    const usage = estimateTokens(request.messages, raw);
    tracker.ok(options?.requestId ?? "n/a", usage);
    return { data: result.data, usage };
  }

  async *streamText(request: LlmRequest, options?: CallOptions): AsyncGenerator<LlmStreamChunk> {
    const text = this.scripted.shift() ?? "This is a mock reply.";
    const words = text.split(/(\s+)/);
    for (const delta of words) {
      if (options?.signal?.aborted) return;
      yield { delta };
    }
    yield { delta: "", usage: estimateTokens(request.messages, text) };
  }

  async healthCheck(_options?: CallOptions): Promise<HealthReport> {
    return { ok: true, latencyMs: 0, detail: "mock provider always healthy" };
  }
}

export class MockAsrProvider implements AsrProvider {
  readonly id = "mock-asr";
  private readonly scripted: AsrResult[];

  constructor(
    private readonly config: MockBaseConfig = {},
    scripted: AsrResult[] = [{ text: "mock transcript", confidence: 1 }],
  ) {
    this.scripted = [...scripted];
  }

  enqueue(result: AsrResult): void {
    this.scripted.push(result);
  }

  async transcribe(
    _audio: Uint8Array,
    _mimeType: string,
    options?: CallOptions,
  ): Promise<AsrResult> {
    const tracker = new RequestTracker(
      this.config.logger ?? silentLogger,
      options?.requestId ?? mockRequestId(),
      this.id,
      "asr.transcribe",
    );
    const failure = nextFailure(this.config.failures);
    if (failure !== undefined) tracker.fail(failure, options?.requestId ?? "n/a");
    // NOTE: audio bytes are deliberately not logged or retained.
    const result = this.scripted.shift() ?? { text: "mock transcript", confidence: 1 };
    tracker.ok(options?.requestId ?? "n/a");
    return result;
  }

  async healthCheck(_options?: CallOptions): Promise<HealthReport> {
    return { ok: true, latencyMs: 0, detail: "mock provider always healthy" };
  }
}

export class MockTtsProvider implements TtsProvider {
  readonly id = "mock-tts";

  constructor(private readonly config: MockBaseConfig = {}) {}

  async synthesize(_text: string, _voice?: string, options?: CallOptions): Promise<TtsResult> {
    const tracker = new RequestTracker(
      this.config.logger ?? silentLogger,
      options?.requestId ?? mockRequestId(),
      this.id,
      "tts.synthesize",
    );
    const failure = nextFailure(this.config.failures);
    if (failure !== undefined) tracker.fail(failure, options?.requestId ?? "n/a");
    // One second of silence in a stub WAV container - enough for UI wiring.
    const audio = new Uint8Array(44 + 8000);
    tracker.ok(options?.requestId ?? "n/a", {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    return { audio, mimeType: "audio/wav" };
  }

  async healthCheck(_options?: CallOptions): Promise<HealthReport> {
    return { ok: true, latencyMs: 0, detail: "mock provider always healthy" };
  }
}

let mockSeq = 0;
function mockRequestId(): string {
  mockSeq += 1;
  return `mock-${mockSeq}`;
}

const silentLogger: GatewayLogger = { log() {} };

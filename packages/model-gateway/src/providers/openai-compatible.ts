// OpenAI-compatible chat-completions provider. Works against any endpoint
// exposing the /v1/chat/completions contract (OpenAI, DeepSeek, Moonshot,
// local llama.cpp servers, ...), which keeps provider choice replaceable.
//
// Design constraints:
// - fetch is injected, so unit tests run without network.
// - Every call has a deadline (AbortController) and maps failures into the
//   unified GatewayError taxonomy.
// - API keys are passed in pre-resolved (see resolveApiKey); they are never
//   logged and never appear in error details.

import type { z } from "zod";
import { GatewayError, kindForStatus } from "../errors";
import { RequestTracker, redactSecrets, type GatewayLogger } from "../telemetry";
import type {
  CallOptions,
  HealthReport,
  LlmProvider,
  LlmRequest,
  LlmStreamChunk,
  LlmTextResult,
  TokenUsage,
} from "../types";

export interface OpenAiCompatibleConfig {
  readonly id?: string;
  /** e.g. https://api.openai.com/v1 */
  readonly baseUrl: string;
  readonly model: string;
  /** Pre-resolved key (resolveApiKey over the OS keyring). */
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly logger?: GatewayLogger;
  /** Injectable for tests. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const ERROR_DETAIL_LIMIT = 200;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string; reasoning_content?: string };
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Reasoning models (e.g. DeepSeek reasoning variants) spend the completion
 * budget on hidden `reasoning_content` before emitting any `content`. When the
 * budget is too small they return empty content with finish_reason "length".
 * The non-streaming chat path retries once with a larger budget so callers get
 * usable output instead of a confusing parse failure.
 */
const RETRY_MIN_COMPLETION_TOKENS = 8_192;
const RETRY_MAX_COMPLETION_TOKENS = 16_384;
// JSON-mode providers occasionally answer HTTP 200 with whitespace-only
// content (finish_reason "stop"). A fresh call almost always recovers. Other
// malformed output stays an immediate failure so callers can show their own
// retry UI instead of silently burning requests.
const MAX_STRUCTURED_ATTEMPTS = 3;

function toUsage(raw: ChatCompletionResponse["usage"]): TokenUsage | undefined {
  if (!raw) return undefined;
  const usage: TokenUsage = {
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
  };
  return usage.totalTokens === undefined && usage.promptTokens === undefined ? undefined : usage;
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly id: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.id = config.id ?? `openai-compatible:${config.model}`;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async generateText(request: LlmRequest, options?: CallOptions): Promise<LlmTextResult> {
    const tracker = this.tracker("llm.generateText", options);
    const response = await this.chat(request, options, tracker);
    const text = response.choices?.[0]?.message?.content ?? "";
    return { text, usage: toUsage(response.usage) };
  }

  async generateStructured<T>(
    request: LlmRequest,
    schema: z.ZodType<T>,
    options?: CallOptions,
  ): Promise<{ data: T; usage?: TokenUsage }> {
    const tracker = this.tracker("llm.generateStructured", options);
    let response: ChatCompletionResponse | undefined;
    let finishReason: string | undefined;
    let text = "";
    let parsed: unknown;
    let parseError: unknown;
    for (let attempt = 0; attempt < MAX_STRUCTURED_ATTEMPTS; attempt++) {
      response = await this.chat({ ...request, jsonMode: true }, options, tracker);
      const choice = response.choices?.[0];
      finishReason = choice?.finish_reason;
      text = choice?.message?.content ?? "";
      try {
        parsed = JSON.parse(text);
        parseError = undefined;
        break;
      } catch (e) {
        parseError = e;
        // Only whitespace-only/empty output is worth an automatic retry. A
        // reasoning model that exhausted its budget already retried inside
        // chat(); other malformed output is left for the caller's retry UI.
        if (text.trim() || (!text && finishReason === "length")) break;
      }
    }
    if (parseError !== undefined) {
      const hint =
        !text && finishReason === "length"
          ? " (completion budget exhausted by hidden reasoning; retry failed to produce content)"
          : !text
            ? " (empty content)"
            : !text.trim()
              ? ` (blank output across ${MAX_STRUCTURED_ATTEMPTS} attempts)`
              : "";
      throw tracker.fail(
        new GatewayError({
          kind: "schema_violation",
          providerId: this.id,
          message: `model returned non-JSON output${hint}`,
          cause: parseError,
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
          message: `model output failed schema validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        }),
        options?.requestId ?? "n/a",
      );
    }
    return { data: result.data, usage: toUsage(response?.usage) };
  }

  async *streamText(request: LlmRequest, options?: CallOptions): AsyncGenerator<LlmStreamChunk> {
    const tracker = this.tracker("llm.streamText", options);
    const response = await this.rawChat(request, options, true, async (response) => response).catch(
      (error) => tracker.fail(error, options?.requestId ?? "n/a"),
    );
    try {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, "").trim();
          if (!payload || payload === "[DONE]") continue;
          const event = JSON.parse(payload) as ChatCompletionResponse;
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
          const usage = toUsage(event.usage);
          if (usage) yield { delta: "", usage };
        }
      }
    } catch (error) {
      tracker.fail(error, options?.requestId ?? "n/a");
    }
    tracker.ok(options?.requestId ?? "n/a");
  }

  async healthCheck(options?: CallOptions): Promise<HealthReport> {
    const startedAt = performance.now();
    try {
      return await this.fetchWithDeadline(
        `${this.config.baseUrl}/models`,
        { method: "GET", headers: this.headers() },
        options,
        Math.min(options?.timeoutMs ?? 5_000, 5_000),
        async (response) => {
          const latencyMs = Math.round(performance.now() - startedAt);
          if (!response.ok) {
            const detail = await readErrorDetail(response);
            return { ok: false, latencyMs, detail: `HTTP ${response.status}: ${detail}` };
          }
          return { ok: true, latencyMs };
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        detail: redactSecrets(detail),
      };
    }
  }

  // -------------------------------------------------------------------------

  private tracker(
    operation: "llm.generateText" | "llm.generateStructured" | "llm.streamText",
    options?: CallOptions,
  ): RequestTracker {
    return new RequestTracker(
      this.config.logger ?? { log() {} },
      options?.requestId ?? crypto.randomUUID(),
      this.id,
      operation,
    );
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async chat(
    request: LlmRequest,
    options: CallOptions | undefined,
    tracker: RequestTracker,
  ): Promise<ChatCompletionResponse> {
    let parsed = await this.chatOnce(request, options, tracker);
    const firstChoice = parsed.choices?.[0];
    // Reasoning models can spend the entire completion budget on hidden
    // reasoning_content, returning empty content with finish_reason "length".
    // Retry once with a larger budget before surfacing the failure.
    if (!firstChoice?.message?.content && firstChoice?.finish_reason === "length") {
      const base = request.maxTokens ?? 2_048;
      const retryMaxTokens = Math.min(
        Math.max(base * 4, RETRY_MIN_COMPLETION_TOKENS),
        RETRY_MAX_COMPLETION_TOKENS,
      );
      if (retryMaxTokens > base) {
        parsed = await this.chatOnce({ ...request, maxTokens: retryMaxTokens }, options, tracker);
      }
    }
    return parsed;
  }

  private async chatOnce(
    request: LlmRequest,
    options: CallOptions | undefined,
    tracker: RequestTracker,
  ): Promise<ChatCompletionResponse> {
    return this.rawChat(request, options, false, async (response) => {
      if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new GatewayError({
          kind: kindForStatus(response.status),
          providerId: this.id,
          message: `provider returned HTTP ${response.status}`,
          statusCode: response.status,
          detail,
        });
      }
      return (await response.json()) as ChatCompletionResponse;
    }).catch((error) => tracker.fail(error, options?.requestId ?? "n/a"));
  }

  private async rawChat<T>(
    request: LlmRequest,
    options: CallOptions | undefined,
    stream: boolean,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: request.messages,
      stream,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.jsonMode) body.response_format = { type: "json_object" };
    if (stream) body.stream_options = { include_usage: true };

    return this.fetchWithDeadline(
      `${this.config.baseUrl}/chat/completions`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(body) },
      options,
      options?.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      consume,
    );
  }

  /** fetch with a hard deadline plus caller cancellation. */
  private async fetchWithDeadline<T>(
    url: string,
    init: RequestInit,
    options: CallOptions | undefined,
    timeoutMs: number,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException("timeout", "TimeoutError")),
      timeoutMs,
    );
    const external = options?.signal;
    const onExternalAbort = () => controller.abort(external?.reason);
    external?.addEventListener("abort", onExternalAbort, { once: true });
    try {
      if (external?.aborted) onExternalAbort();
      controller.signal.throwIfAborted();
      const response = await this.fetchImpl(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
      const result = await consume(response);
      controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      const reason = controller.signal.reason ?? error;
      if (reason instanceof DOMException && reason.name === "TimeoutError") {
        throw new GatewayError({
          kind: "timeout",
          providerId: this.id,
          message: `call exceeded ${timeoutMs}ms`,
        });
      }
      if (
        controller.signal.aborted ||
        (reason instanceof DOMException && reason.name === "AbortError")
      ) {
        throw new GatewayError({
          kind: "cancelled",
          providerId: this.id,
          message: "call cancelled by caller",
        });
      }
      if (error instanceof TypeError) {
        throw new GatewayError({
          kind: "network",
          providerId: this.id,
          message: "connection failed",
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    }
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    // Redact in case the provider echoes credentials back in error bodies.
    return redactSecrets(text).slice(0, ERROR_DETAIL_LIMIT);
  } catch {
    return "(unreadable error body)";
  }
}

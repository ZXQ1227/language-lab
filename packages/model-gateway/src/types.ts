// Unified provider interfaces. Teaching code depends ONLY on these - swapping
// a provider (mock -> OpenAI-compatible -> anything else) never touches
// business logic.
//
// Key handling (blueprint v1.1): API keys live in the OS keyring via the Rust
// core (see keys.ts). Keys are resolved before a provider is constructed and
// never logged.

import type { z } from "zod";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LlmRequest {
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Ask the model for JSON output (when the provider supports it). */
  readonly jsonMode?: boolean;
}

export interface CallOptions {
  /** Per-call timeout in milliseconds. Overrides provider default. */
  readonly timeoutMs?: number;
  /** Cancellation signal from the caller. */
  readonly signal?: AbortSignal;
  /** Correlation id for telemetry. */
  readonly requestId?: string;
}

export interface TokenUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

export interface LlmTextResult {
  readonly text: string;
  readonly usage?: TokenUsage;
}

export interface LlmStreamChunk {
  readonly delta: string;
  /** Present on the final chunk when the provider reports usage. */
  readonly usage?: TokenUsage;
}

export interface HealthReport {
  readonly ok: boolean;
  /** Round-trip latency of the check itself, when measured. */
  readonly latencyMs?: number;
  /** Short human-readable detail; must never contain secrets. */
  readonly detail?: string;
}

export interface LlmProvider {
  readonly id: string;
  generateText(request: LlmRequest, options?: CallOptions): Promise<LlmTextResult>;
  /**
   * Structured output: the parsed result is validated against the given Zod
   * schema. A validation failure raises GatewayError("schema_violation") -
   * callers never receive unvalidated model output.
   */
  generateStructured<T>(
    request: LlmRequest,
    schema: z.ZodType<T>,
    options?: CallOptions,
  ): Promise<{ data: T; usage?: TokenUsage }>;
  /** Streams text deltas; the final chunk may carry usage. */
  streamText(request: LlmRequest, options?: CallOptions): AsyncIterable<LlmStreamChunk>;
  healthCheck(options?: CallOptions): Promise<HealthReport>;
}

export interface AsrResult {
  readonly text: string;
  readonly confidence?: number;
  readonly usage?: TokenUsage;
}

export interface AsrProvider {
  readonly id: string;
  /** Raw recordings are processed in-memory and never persisted. */
  transcribe(audio: Uint8Array, mimeType: string, options?: CallOptions): Promise<AsrResult>;
  healthCheck(options?: CallOptions): Promise<HealthReport>;
}

export interface TtsResult {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly usage?: TokenUsage;
}

export interface TtsProvider {
  readonly id: string;
  synthesize(text: string, voice?: string, options?: CallOptions): Promise<TtsResult>;
  healthCheck(options?: CallOptions): Promise<HealthReport>;
}

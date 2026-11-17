// Telemetry: request duration, error kind and token usage per gateway call.
//
// Privacy rules (hard requirements):
// - Never log API keys - every log line passes through redactSecrets().
// - Never log audio content or full transcripts; sizes only.

import type { TokenUsage } from "./types";
import { toGatewayError } from "./errors";

export interface GatewayEvent {
  readonly requestId: string;
  readonly providerId: string;
  readonly operation:
    | "llm.generateText"
    | "llm.generateStructured"
    | "llm.streamText"
    | "asr.transcribe"
    | "tts.synthesize"
    | "healthCheck";
  readonly durationMs: number;
  readonly outcome: "ok" | "error";
  readonly errorKind?: string;
  readonly usage?: TokenUsage;
}

export interface GatewayLogger {
  log(event: GatewayEvent): void;
}

const SECRET_PATTERN = /\b(sk|rk|api[_-]?key)[-_]([A-Za-z0-9_-]{8,})\b/gi;

/** Masks anything that looks like an API key: `sk-abc...` -> `sk-***`. */
export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, (_m, prefix: string) => `${prefix}-***`);
}

/** Console logger for development; production UI may implement its own. */
export function createConsoleLogger(): GatewayLogger {
  return {
    log(event) {
      const line = redactSecrets(
        `[gateway] ${event.requestId} ${event.providerId} ${event.operation} ` +
          `${event.durationMs.toFixed(0)}ms ${event.outcome}` +
          (event.errorKind ? ` error=${event.errorKind}` : "") +
          (event.usage?.totalTokens !== undefined ? ` tokens=${event.usage.totalTokens}` : ""),
      );
      if (event.outcome === "error") console.warn(line);
      else console.info(line);
    },
  };
}

export class RequestTracker {
  private readonly startedAt: number;

  constructor(
    private readonly logger: GatewayLogger,
    readonly requestId: string,
    private readonly providerId: string,
    private readonly operation: GatewayEvent["operation"],
  ) {
    this.startedAt = performance.now();
  }

  /** Measures duration and reports an error outcome. Rethrows after logging. */
  fail(error: unknown, requestId: string): never {
    const gatewayError = toGatewayError(error, this.providerId);
    this.emit("error", requestId, undefined, gatewayError.kind);
    throw gatewayError;
  }

  ok(requestId: string, usage?: TokenUsage): number {
    this.emit("ok", requestId, usage);
    return Math.round(performance.now() - this.startedAt);
  }

  private emit(
    outcome: GatewayEvent["outcome"],
    requestId: string,
    usage: TokenUsage | undefined,
    errorKind?: string,
  ): void {
    this.logger.log({
      requestId,
      providerId: this.providerId,
      operation: this.operation,
      durationMs: Math.round(performance.now() - this.startedAt),
      outcome,
      errorKind,
      usage,
    });
  }
}

// Gateway facade: the single object teaching code receives in its context.
// Constructed once at app startup from user configuration; providers are
// swappable without any change to business code.

import type { AsrProvider, HealthReport, LlmProvider, TtsProvider } from "./types";
import { isGatewayError } from "./errors";
import type { GatewayLogger } from "./telemetry";
import { MockAsrProvider, MockLlmProvider, MockTtsProvider } from "./providers/mock";

export interface GatewayConfig {
  readonly llm: LlmProvider;
  /** Voice features are optional in v1. */
  readonly asr?: AsrProvider;
  readonly tts?: TtsProvider;
  readonly logger?: GatewayLogger;
}

export interface ModelGateway {
  readonly llm: LlmProvider;
  readonly asr?: AsrProvider;
  readonly tts?: TtsProvider;
  readonly logger?: GatewayLogger;
  /** Health of every configured provider, keyed by capability. */
  healthCheckAll(options?: { timeoutMs?: number }): Promise<Record<string, HealthReport>>;
}

export function createGateway(config: GatewayConfig): ModelGateway {
  return {
    llm: config.llm,
    asr: config.asr,
    tts: config.tts,
    logger: config.logger,
    async healthCheckAll(options) {
      const asr = config.asr;
      const tts = config.tts;
      const entries: Array<readonly [string, () => Promise<HealthReport>]> = [
        ["llm", () => config.llm.healthCheck({ timeoutMs: options?.timeoutMs })],
      ];
      if (asr) entries.push(["asr", () => asr.healthCheck({ timeoutMs: options?.timeoutMs })]);
      if (tts) entries.push(["tts", () => tts.healthCheck({ timeoutMs: options?.timeoutMs })]);

      const results = await Promise.all(
        entries.map(async ([key, check]) => {
          try {
            return [key, await check()] as const;
          } catch (error) {
            const detail = isGatewayError(error) ? (error.detail ?? error.kind) : undefined;
            return [key, { ok: false, detail: detail ?? "health check failed" }] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
  };
}

/** Default offline gateway: mock providers, no network, no keys needed. */
export function createMockGateway(logger?: GatewayLogger): ModelGateway {
  return createGateway({
    llm: new MockLlmProvider({ logger }),
    asr: new MockAsrProvider({ logger }),
    tts: new MockTtsProvider({ logger }),
    logger,
  });
}

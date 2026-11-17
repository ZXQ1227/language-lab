// @language-lab/model-gateway
// Unified AI model access layer. Teaching code depends only on the
// LlmProvider / AsrProvider / TtsProvider interfaces below - swapping
// providers never touches business logic.
//
// Runtime transport design (per blueprint v1.1):
// - API keys live in the OS keyring (Rust core); see keys.ts.
// - Outbound calls go through an injected fetch adapter so a Rust ai_proxy
//   transport can replace browser fetch later without interface changes.

export * from "./types";
export * from "./errors";
export * from "./telemetry";
export * from "./keys";
export * from "./gateway";
export * from "./providers/mock";
export * from "./providers/openai-compatible";

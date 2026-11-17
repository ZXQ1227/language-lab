// @language-lab/model-gateway
// Pluggable LLM / ASR / TTS provider interfaces.
//
// Runtime transport design (per blueprint v1.1):
// - Provider keys live in the OS keyring, read by the Rust core. They never
//   enter the webview.
// - Outbound calls go through a Rust `ai_proxy` command; in dev mode a fetch
//   transport may be used instead.
// Only interfaces here - provider implementations come later.

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LlmRequest {
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly jsonMode?: boolean;
}

export interface LlmResponse {
  readonly text: string;
}

export interface LlmProvider {
  readonly id: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Placeholder until ASR wiring is designed. Raw recordings are not persisted. */
export interface AsrProvider {
  readonly id: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<{ text: string; confidence?: number }>;
}

export interface TtsProvider {
  readonly id: string;
  synthesize(text: string, voice?: string): Promise<{ audio: Uint8Array; mimeType: string }>;
}

/** Aggregate handle passed into SkillContext. Voice features are optional in v1. */
export interface ModelGateway {
  readonly llm: LlmProvider;
  readonly asr?: AsrProvider;
  readonly tts?: TtsProvider;
}

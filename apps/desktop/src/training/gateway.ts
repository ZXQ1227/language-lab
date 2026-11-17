import {
  createGateway,
  createMockGateway,
  OpenAiCompatibleLlmProvider,
  type KeyName,
} from "@language-lab/model-gateway";
import { call } from "../lib/ipc";
import { isLocalEndpoint, type TrainingProvider } from "./session";

/** Credentials are scoped to the exact endpoint, never reused across hosts. */
async function keyName(provider: Extract<TrainingProvider, { mode: "ai" }>): Promise<KeyName> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(provider.baseUrl));
  return `llm.training.${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function saveTrainingKey(provider: TrainingProvider, value: string): Promise<void> {
  if (provider.mode === "ai") await call("secrets_set", { name: await keyName(provider), value });
}

export async function trainingGateway(provider: TrainingProvider) {
  if (provider.mode === "demo") return createMockGateway();
  const apiKey = await call<string | null>("secrets_get", { name: await keyName(provider) });
  if (!apiKey && !isLocalEndpoint(provider.baseUrl))
    throw new Error("Save an API key for this AI connection before starting");
  return createGateway({
    llm: new OpenAiCompatibleLlmProvider({
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: apiKey ?? "",
      timeoutMs: 45000,
    }),
  });
}

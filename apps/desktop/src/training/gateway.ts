import { z } from "zod";
import {
  createGateway,
  createMockGateway,
  GatewayError,
  OpenAiCompatibleLlmProvider,
  type KeyName,
} from "@language-lab/model-gateway";
import { call } from "../lib/ipc";
import { isLocalEndpoint, trainingProviderSchema, type TrainingProvider } from "./provider";

/** Credentials are scoped to the exact endpoint, never reused across hosts. */
async function keyName(baseUrl: string): Promise<KeyName> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(baseUrl));
  return `llm.training.${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function saveTrainingKey(raw: TrainingProvider, value: string): Promise<void> {
  const provider = trainingProviderSchema.parse(raw);
  if (provider.mode === "ai") {
    await call("secrets_set", {
      name: await keyName(provider.baseUrl.replace(/\/+$/, "")),
      value,
    });
  }
}

export async function trainingGateway(raw: TrainingProvider) {
  const provider = trainingProviderSchema.parse(raw);
  if (provider.mode === "demo") return createMockGateway();
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  let apiKey = await call<string | null>("secrets_get", { name: await keyName(baseUrl) });
  if (!apiKey && provider.baseUrl !== baseUrl) {
    // Older Settings saved keys using the exact, trailing-slash spelling.
    apiKey = await call<string | null>("secrets_get", { name: await keyName(provider.baseUrl) });
  }
  if (!apiKey && !isLocalEndpoint(baseUrl)) {
    throw new GatewayError({
      kind: "auth",
      providerId: "training",
      message: "Save an API key for this AI connection before starting",
    });
  }
  return createGateway({
    llm: new OpenAiCompatibleLlmProvider({
      baseUrl,
      model: provider.model,
      apiKey: apiKey ?? "",
      timeoutMs: 45000,
    }),
  });
}

const connectionProbeSchema = z.strictObject({ ok: z.literal(true) });

export async function verifyTrainingConnection(provider: TrainingProvider): Promise<void> {
  const gateway = await trainingGateway(provider);
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new DOMException("timeout", "TimeoutError")),
    12_000,
  );
  try {
    await gateway.llm.generateStructured(
      {
        messages: [{ role: "system", content: 'Reply only with this JSON object: {"ok":true}' }],
        maxTokens: 1024,
      },
      connectionProbeSchema,
      { signal: controller.signal, timeoutMs: 12_000 },
    );
  } finally {
    clearTimeout(deadline);
  }
}

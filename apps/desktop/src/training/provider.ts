import { z } from "zod";
import { saveTrainingKey } from "./gateway";
import { isLocalEndpoint, type TrainingProvider } from "./session";

/**
 * AI 基座（对话模型）连接配置。归属 Settings 页持久化，训练页只消费。
 * Key 永不入库 —— 仅写入系统钥匙串，按端点哈希隔离。
 */
export const aiProviderSettingsSchema = z.object({
  baseUrl: z.string().url().max(500),
  model: z.string().min(1).max(120),
});
export type AiProviderSettings = z.infer<typeof aiProviderSettingsSchema>;

export function defaultAiProviderSettings(): AiProviderSettings {
  return { baseUrl: "http://localhost:11434/v1", model: "llama3.2" };
}

export function toTrainingProvider(settings: AiProviderSettings): TrainingProvider {
  return { mode: "ai", baseUrl: settings.baseUrl, model: settings.model };
}

/** 非本地端点必须已有或正在保存 API 密钥，否则启动课程时网关会拒绝。 */
export function requiresApiKey(settings: AiProviderSettings): boolean {
  return !isLocalEndpoint(settings.baseUrl);
}

export async function saveProviderKeys(
  settings: AiProviderSettings,
  apiKey: string,
): Promise<void> {
  if (apiKey.trim()) await saveTrainingKey(toTrainingProvider(settings), apiKey.trim());
}

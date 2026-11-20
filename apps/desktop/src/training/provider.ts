import { z } from "zod";

const endpointSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalEndpoint(value))) ||
      url.username ||
      url.password ||
      value.includes("?") ||
      value.includes("#")
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Use an HTTPS endpoint (or localhost HTTP), without credentials, query parameters or fragments",
      });
    }
  });

export const aiProviderSettingsSchema = z.object({
  baseUrl: endpointSchema,
  model: z.string().trim().min(1).max(120),
});
export type AiProviderSettings = z.infer<typeof aiProviderSettingsSchema>;

export const trainingProviderSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("demo") }),
  z.strictObject({
    mode: z.literal("ai"),
    ...aiProviderSettingsSchema.shape,
  }),
]);
export type TrainingProvider = z.infer<typeof trainingProviderSchema>;

export function isLocalEndpoint(baseUrl: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname);
}

export function defaultAiProviderSettings(): AiProviderSettings {
  return { baseUrl: "http://localhost:11434/v1", model: "llama3.2" };
}

export function toTrainingProvider(settings: AiProviderSettings): TrainingProvider {
  return { mode: "ai", baseUrl: settings.baseUrl, model: settings.model };
}

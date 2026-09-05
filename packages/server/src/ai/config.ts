export interface AiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  requestTimeoutMs: number;
}

export const aiConfig: Readonly<AiConfig> = Object.freeze({
  get provider(): string {
    return process.env.AI_PROVIDER || "scripted";
  },
  get baseUrl(): string {
    return process.env.AI_BASE_URL || "https://opencode.ai/zen/v1";
  },
  get apiKey(): string {
    return process.env.AI_API_KEY || "";
  },
  get defaultModel(): string {
    return process.env.AI_DEFAULT_MODEL || "scripted-default";
  },
  get requestTimeoutMs(): number {
    const parsed = Number(process.env.AI_REQUEST_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 300000;
  },
});

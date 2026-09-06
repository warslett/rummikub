export interface AiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  maxToolIterations: number;
  malformedLimit: number;
  contextTokenLimit: number;
  compactKeepTurns: number;
  debug: boolean;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
    return positiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 300000);
  },
  get maxRetries(): number {
    return nonNegativeInt(process.env.AI_MAX_RETRIES, 3);
  },
  get retryBaseMs(): number {
    return positiveInt(process.env.AI_RETRY_BASE_MS, 1000);
  },
  get maxToolIterations(): number {
    return positiveInt(process.env.AI_MAX_TOOL_ITERATIONS, 25);
  },
  get malformedLimit(): number {
    return nonNegativeInt(process.env.AI_MALFORMED_LIMIT, 2);
  },
  get contextTokenLimit(): number {
    return positiveInt(process.env.AI_CONTEXT_TOKEN_LIMIT, 100000);
  },
  get compactKeepTurns(): number {
    return nonNegativeInt(process.env.AI_COMPACT_KEEP_TURNS, 6);
  },
  get debug(): boolean {
    return process.env.AI_DEBUG === "true";
  },
});

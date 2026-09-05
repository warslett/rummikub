import { describe, it, expect, vi, afterEach } from "vitest";
import { aiConfig } from "./config.js";

describe("aiConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return default values when no env vars are set", () => {
    expect(aiConfig.provider).toBe("scripted");
    expect(aiConfig.baseUrl).toBe("https://opencode.ai/zen/v1");
    expect(aiConfig.apiKey).toBe("");
    expect(aiConfig.defaultModel).toBe("scripted-default");
    expect(aiConfig.requestTimeoutMs).toBe(300000);
  });

  it("should return env overrides for provider, baseUrl, apiKey and defaultModel", () => {
    vi.stubEnv("AI_PROVIDER", "llm");
    vi.stubEnv("AI_BASE_URL", "https://example.com/v1");
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_DEFAULT_MODEL", "claude-sonnet-5");

    expect(aiConfig.provider).toBe("llm");
    expect(aiConfig.baseUrl).toBe("https://example.com/v1");
    expect(aiConfig.apiKey).toBe("secret-key");
    expect(aiConfig.defaultModel).toBe("claude-sonnet-5");
  });

  it("should return env override for requestTimeoutMs", () => {
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "1000");
    expect(aiConfig.requestTimeoutMs).toBe(1000);
  });

  it("should fall back to default requestTimeoutMs for invalid values", () => {
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "not-a-number");
    expect(aiConfig.requestTimeoutMs).toBe(300000);

    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "-5");
    expect(aiConfig.requestTimeoutMs).toBe(300000);
  });
});

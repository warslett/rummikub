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
    expect(aiConfig.maxRetries).toBe(3);
    expect(aiConfig.retryBaseMs).toBe(1000);
    expect(aiConfig.maxToolIterations).toBe(25);
    expect(aiConfig.malformedLimit).toBe(2);
    expect(aiConfig.contextTokenLimit).toBe(100000);
    expect(aiConfig.compactKeepTurns).toBe(6);
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

  it("should return env overrides for robustness knobs", () => {
    vi.stubEnv("AI_MAX_RETRIES", "5");
    vi.stubEnv("AI_RETRY_BASE_MS", "500");
    vi.stubEnv("AI_MAX_TOOL_ITERATIONS", "40");
    vi.stubEnv("AI_MALFORMED_LIMIT", "3");
    vi.stubEnv("AI_CONTEXT_TOKEN_LIMIT", "20000");
    vi.stubEnv("AI_COMPACT_KEEP_TURNS", "4");

    expect(aiConfig.maxRetries).toBe(5);
    expect(aiConfig.retryBaseMs).toBe(500);
    expect(aiConfig.maxToolIterations).toBe(40);
    expect(aiConfig.malformedLimit).toBe(3);
    expect(aiConfig.contextTokenLimit).toBe(20000);
    expect(aiConfig.compactKeepTurns).toBe(4);
  });

  it("should fall back to defaults for invalid robustness knob values", () => {
    vi.stubEnv("AI_MAX_RETRIES", "abc");
    vi.stubEnv("AI_RETRY_BASE_MS", "-1");
    vi.stubEnv("AI_MAX_TOOL_ITERATIONS", "0");
    vi.stubEnv("AI_MALFORMED_LIMIT", "x");
    vi.stubEnv("AI_CONTEXT_TOKEN_LIMIT", "nope");
    vi.stubEnv("AI_COMPACT_KEEP_TURNS", "-3");

    expect(aiConfig.maxRetries).toBe(3);
    expect(aiConfig.retryBaseMs).toBe(1000);
    expect(aiConfig.maxToolIterations).toBe(25);
    expect(aiConfig.malformedLimit).toBe(2);
    expect(aiConfig.contextTokenLimit).toBe(100000);
    expect(aiConfig.compactKeepTurns).toBe(6);
  });

  it("should honor 0 for knobs where it is meaningful", () => {
    vi.stubEnv("AI_MAX_RETRIES", "0");
    vi.stubEnv("AI_MALFORMED_LIMIT", "0");
    vi.stubEnv("AI_COMPACT_KEEP_TURNS", "0");

    expect(aiConfig.maxRetries).toBe(0);
    expect(aiConfig.malformedLimit).toBe(0);
    expect(aiConfig.compactKeepTurns).toBe(0);
  });
});

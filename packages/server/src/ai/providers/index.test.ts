import { describe, it, expect, vi, afterEach } from "vitest";
import { getProvider } from "./index.js";
import { ScriptedProvider } from "./scripted.js";
import { LlmProvider } from "./llm.js";
import { aiConfig } from "../config.js";

describe("providerFactory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return ScriptedProvider for 'scripted' and unknown provider names", () => {
    expect(getProvider("scripted")).toBeInstanceOf(ScriptedProvider);
    expect(getProvider("some-unknown-provider")).toBeInstanceOf(ScriptedProvider);
  });

  it("should return LlmProvider when AI_PROVIDER=llm (TC-AI-10)", () => {
    vi.stubEnv("AI_PROVIDER", "llm");
    vi.stubEnv("AI_API_KEY", "test-key");

    const provider = getProvider(aiConfig.provider);
    expect(provider).toBeInstanceOf(LlmProvider);
  });

  it("should return LlmProvider for 'llm' even without an API key (fails at first turn)", () => {
    vi.stubEnv("AI_API_KEY", "");

    const provider = getProvider("llm");
    expect(provider).toBeInstanceOf(LlmProvider);
    expect(typeof provider.takeTurn).toBe("function");
  });
});

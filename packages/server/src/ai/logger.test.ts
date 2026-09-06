import { describe, it, expect, vi, afterEach } from "vitest";
import { aiLog } from "./logger.js";

describe("aiLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should not log anything when AI_DEBUG is off (default)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    aiLog("ABC123", "ai-1", "test-model", "request", { messageCount: 2 });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("should log a JSON line with ts, gameCode, playerId, model, event and data when AI_DEBUG is on", () => {
    vi.stubEnv("AI_DEBUG", "true");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    aiLog("ABC123", "ai-1", "test-model", "request", { messageCount: 2 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.ts).toEqual(expect.any(String));
    expect(isNaN(Date.parse(parsed.ts as string))).toBe(false);
    expect(parsed.gameCode).toBe("ABC123");
    expect(parsed.playerId).toBe("ai-1");
    expect(parsed.model).toBe("test-model");
    expect(parsed.event).toBe("request");
    expect(parsed.data).toEqual({ messageCount: 2 });
  });

  it("should keep correlation fields stable across events", () => {
    vi.stubEnv("AI_DEBUG", "true");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    aiLog("XYZ789", "ai-2", "m", "request", { messageCount: 2 });
    aiLog("XYZ789", "ai-2", "m", "response", { content: "hi" });

    const first = JSON.parse(logSpy.mock.calls[0][0] as string);
    const second = JSON.parse(logSpy.mock.calls[1][0] as string);
    expect(first.gameCode).toBe(second.gameCode);
    expect(first.playerId).toBe(second.playerId);
    expect(first.model).toBe(second.model);
    expect(first.event).toBe("request");
    expect(second.event).toBe("response");
  });

  it("should support the reasoning event for chain-of-thought", () => {
    vi.stubEnv("AI_DEBUG", "true");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    aiLog("XYZ789", "ai-2", "m", "reasoning", { content: "think step by step" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("reasoning");
    expect(parsed.data).toEqual({ content: "think step by step" });
  });
});

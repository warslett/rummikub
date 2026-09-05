import { describe, it, expect, vi, afterEach } from "vitest";
import { aiLog } from "./logger.js";

describe("aiLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log a JSON line with ts, gameCode, playerId, model, event and data", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    aiLog("ABC123", "ai-1", "test-model", "tool_call", { name: "draw_tile" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.ts).toEqual(expect.any(String));
    expect(isNaN(Date.parse(parsed.ts as string))).toBe(false);
    expect(parsed.gameCode).toBe("ABC123");
    expect(parsed.playerId).toBe("ai-1");
    expect(parsed.model).toBe("test-model");
    expect(parsed.event).toBe("tool_call");
    expect(parsed.data).toEqual({ name: "draw_tile" });
  });

  it("should keep correlation fields stable across events", () => {
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
});

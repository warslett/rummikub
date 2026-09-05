import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getModels, _clearModelsCache } from "./models.js";
import { aiConfig } from "./config.js";

describe("getModels", () => {
  beforeEach(() => {
    _clearModelsCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return default model when fetch fails or errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await getModels();
    expect(result.models).toEqual([aiConfig.defaultModel]);
    expect(result.defaultModel).toBe(aiConfig.defaultModel);
  });

  it("should return default model when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }));

    const result = await getModels();
    expect(result.models).toEqual([aiConfig.defaultModel]);
    expect(result.defaultModel).toBe(aiConfig.defaultModel);
  });

  it("should parse and sort model IDs and fallback defaultModel to first model when not in list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "model-z" }, { id: "model-a" }, { id: "model-m" }],
      }),
    }));

    const result = await getModels();
    expect(result.models).toEqual(["model-a", "model-m", "model-z"]);
    expect(result.defaultModel).toBe("model-a");
  });

  it("should retain defaultModel when it is present in fetched model list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "model-z" }, { id: aiConfig.defaultModel }, { id: "model-a" }],
      }),
    }));

    const result = await getModels();
    expect(result.defaultModel).toBe(aiConfig.defaultModel);
  });

  it("should cache successful model list for 5 minutes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "model-1" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getModels();
    const second = await getModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});

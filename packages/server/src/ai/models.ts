import type { AiModelsPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  payload: AiModelsPayload;
  expiresAt: number;
}

let cachedModels: CacheEntry | null = null;

export async function getModels(): Promise<AiModelsPayload> {
  const now = Date.now();
  if (cachedModels && cachedModels.expiresAt > now) {
    return cachedModels.payload;
  }

  const fallback: AiModelsPayload = {
    models: [aiConfig.defaultModel],
    defaultModel: aiConfig.defaultModel,
  };

  try {
    const url = `${aiConfig.baseUrl}/models`;
    const headers: Record<string, string> = {};
    if (aiConfig.apiKey) {
      headers.Authorization = `Bearer ${aiConfig.apiKey}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as { data?: { id?: string }[] };
    if (!data || !Array.isArray(data.data)) {
      return fallback;
    }

    const modelIds = data.data
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort();

    if (modelIds.length === 0) {
      return fallback;
    }

    const defaultModel = modelIds.includes(aiConfig.defaultModel)
      ? aiConfig.defaultModel
      : modelIds[0] ?? aiConfig.defaultModel;

    const payload: AiModelsPayload = {
      models: modelIds,
      defaultModel,
    };

    cachedModels = {
      payload,
      expiresAt: now + CACHE_TTL_MS,
    };

    return payload;
  } catch {
    return fallback;
  }
}

export function _clearModelsCache(): void {
  cachedModels = null;
}

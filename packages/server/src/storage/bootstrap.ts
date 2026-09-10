import { GameManager } from "../gameManager.js";
import type { GameStore } from "./gameStore.js";
import { ensureSchemaWithRetries } from "./db.js";
import { storageConfig } from "./config.js";
import type { StorageConfig } from "./config.js";
import { createAiStore, setAiStore, flushAiWrites } from "./aiStore.js";
import type { AiStore } from "./aiStore.js";
import { restoreAiState, unloadAiState } from "../ai/runner.js";
import { restoreConversations, unloadConversations } from "../ai/providers/llm.js";
import { restoreTranscripts, unloadTranscripts } from "../ai/debug.js";

export async function bootPersistence(
  manager: GameManager,
  store: GameStore,
  config: StorageConfig = storageConfig,
  schemaFn: () => Promise<void> = () => ensureSchemaWithRetries(),
  aiStore: AiStore = createAiStore(config)
): Promise<number> {
  manager.setStore(store);
  setAiStore(aiStore);
  if (!config.enabled) {
    return 0;
  }
  await schemaFn();
  const restored = await manager.restoreGames();
  await restoreAiState();
  await restoreTranscripts();
  await restoreConversations();
  return restored;
}

export async function reloadGames(manager: GameManager): Promise<number> {
  await manager.flushStorage();
  await flushAiWrites();
  manager.unloadAllGames();
  unloadAiState();
  unloadTranscripts();
  unloadConversations();
  const restored = await manager.restoreGames();
  await restoreAiState();
  await restoreTranscripts();
  await restoreConversations();
  return restored;
}

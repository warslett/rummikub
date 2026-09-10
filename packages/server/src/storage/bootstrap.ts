import { GameManager } from "../gameManager.js";
import type { GameStore } from "./gameStore.js";
import { ensureSchemaWithRetries } from "./db.js";
import { storageConfig } from "./config.js";
import type { StorageConfig } from "./config.js";

export async function bootPersistence(
  manager: GameManager,
  store: GameStore,
  config: StorageConfig = storageConfig,
  schemaFn: () => Promise<void> = () => ensureSchemaWithRetries()
): Promise<number> {
  manager.setStore(store);
  if (!config.enabled) {
    return 0;
  }
  await schemaFn();
  return manager.restoreGames();
}

export async function reloadGames(manager: GameManager): Promise<number> {
  await manager.flushStorage();
  manager.unloadAllGames();
  return manager.restoreGames();
}

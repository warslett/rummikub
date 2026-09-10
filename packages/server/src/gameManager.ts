import { GAME_CODE_CHARS, GAME_CODE_LENGTH } from "@rummikub/shared";
import type { GameState } from "@rummikub/shared";
import { Game } from "./game.js";
import { purgeGame } from "./ai/providers/llm.js";
import { purgeGame as purgeDebugTranscripts } from "./ai/debug.js";
import { resetTurnContext } from "./ai/runner.js";
import { createGameStore, NoopGameStore } from "./storage/gameStore.js";
import type { GameStore } from "./storage/gameStore.js";
import { serializeGameState } from "./storage/serialize.js";

const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class GameManager {
  private games = new Map<string, Game>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private store: GameStore;
  private writeQueues = new Map<string, Promise<void>>();

  constructor(store: GameStore = createGameStore()) {
    this.store = store;
  }

  setStore(store: GameStore): void {
    this.store = store;
  }

  createGame(): { gameCode: string } {
    let code: string;
    do {
      code = this.generateGameCode();
    } while (this.games.has(code));

    const game = new Game(code);
    this.wirePersist(game, code);
    this.games.set(code, game);
    return { gameCode: code };
  }

  getGame(gameCode: string): Game | undefined {
    return this.games.get(gameCode);
  }

  gameCodeExists(gameCode: string): boolean {
    return this.games.has(gameCode);
  }

  cleanupExpiredGames(): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, game] of this.games) {
      if (now - game.getState().lastActivityAt > INACTIVITY_TIMEOUT_MS) {
        this.games.delete(code);
        purgeGame(code);
        purgeDebugTranscripts(code);
        resetTurnContext(code);
        this.queuePersist(code, () => this.store.deleteGame(code));
        removed++;
      }
    }
    return removed;
  }

  async restoreGames(): Promise<number> {
    const states = await this.store.loadAllGames();
    const cutoff = Date.now() - INACTIVITY_TIMEOUT_MS;
    const expired = await this.store.deleteExpiredGames(cutoff);
    let restored = 0;
    for (const state of states) {
      if (expired.includes(state.id)) continue;
      if (this.games.has(state.id)) continue;
      const game = new Game(state.id);
      game.restoreState(state);
      this.wirePersist(game, state.id);
      this.games.set(state.id, game);
      restored++;
    }
    return restored;
  }

  unloadAllGames(): void {
    this.games.clear();
  }

  async flushStorage(): Promise<void> {
    await Promise.all([...this.writeQueues.values()]);
  }

  startCleanup(intervalMs: number = 10 * 60 * 1000): void {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredGames(), intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private wirePersist(game: Game, code: string): void {
    if (this.store instanceof NoopGameStore) {
      return;
    }
    game.onPersist((state: GameState) => {
      const snapshot = serializeGameState(state);
      this.queuePersist(code, () => this.store.upsertGame(snapshot));
    });
  }

  private queuePersist(code: string, task: () => Promise<void>): void {
    const previous = this.writeQueues.get(code) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        await task();
      } catch (err) {
        console.error(`Failed to persist game ${code}:`, err);
      }
    });
    this.writeQueues.set(code, next);
    void next.finally(() => {
      if (this.writeQueues.get(code) === next) {
        this.writeQueues.delete(code);
      }
    });
  }

  private generateGameCode(): string {
    let code = "";
    for (let i = 0; i < GAME_CODE_LENGTH; i++) {
      const index = Math.floor(Math.random() * GAME_CODE_CHARS.length);
      code += GAME_CODE_CHARS[index];
    }
    return code;
  }
}

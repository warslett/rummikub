import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameManager } from "./gameManager";
import { GAME_CODE_LENGTH, GAME_CODE_CHARS } from "@rummikub/shared";
import type { GameState, GamePhase } from "@rummikub/shared";
import { NoopGameStore } from "./storage/gameStore.js";
import type { GameStore } from "./storage/gameStore.js";
import * as llmModule from "./ai/providers/llm.js";
import * as runnerModule from "./ai/runner.js";

function makeState(id: string, phase: GamePhase, lastActivityAt: number): GameState {
  return {
    id,
    phase,
    players: [
      { id: "p1", name: "Alice", rack: [], hasInitialMeld: false, score: 0, connected: true, gamesWon: 0 },
      { id: "p2", name: "Bob", rack: [], hasInitialMeld: false, score: 0, connected: true, gamesWon: 0 },
    ],
    currentTurnIndex: 0,
    board: [],
    pool: [],
    turnActions: [],
    turnSnapshot: null,
    roundNumber: 1,
    consecutivePasses: 0,
    createdAt: lastActivityAt,
    lastActivityAt,
  };
}

function createFakeStore() {
  const games = new Map<string, GameState>();
  const upsertOrder: GameState[] = [];
  return {
    games,
    upsertOrder,
    upsertGame: vi.fn(async (state: GameState) => {
      upsertOrder.push(JSON.parse(JSON.stringify(state)) as GameState);
      games.set(state.id, JSON.parse(JSON.stringify(state)) as GameState);
    }),
    loadAllGames: vi.fn(async () => [...games.values()].map((s) => JSON.parse(JSON.stringify(s)) as GameState)),
    deleteGame: vi.fn(async (code: string) => {
      games.delete(code);
    }),
    deleteExpiredGames: vi.fn(async (cutoffMs: number) => {
      const expired: string[] = [];
      for (const [code, state] of games) {
        if (state.lastActivityAt < cutoffMs) {
          expired.push(code);
          games.delete(code);
        }
      }
      return expired;
    }),
    close: vi.fn(async () => {}),
  };
}

describe("GameManager", () => {
  let manager: GameManager;

  beforeEach(() => {
    manager = new GameManager();
  });

  describe("createGame", () => {
    it("should return a game code", () => {
      const result = manager.createGame();
      expect(result.gameCode).toBeDefined();
      expect(result.gameCode.length).toBe(GAME_CODE_LENGTH);
    });

    it("should generate unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(manager.createGame().gameCode);
      }
      expect(codes.size).toBe(50);
    });

    it("should only use characters from GAME_CODE_CHARS", () => {
      for (let i = 0; i < 20; i++) {
        const code = manager.createGame().gameCode;
        for (const ch of code) {
          expect(GAME_CODE_CHARS).toContain(ch);
        }
      }
    });
  });

  describe("getGame", () => {
    it("should return the game by code", () => {
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode);
      expect(game).not.toBeNull();
      expect(game!.getState().id).toBe(gameCode);
    });

    it("should return undefined for invalid code", () => {
      expect(manager.getGame("INVALID")).toBeUndefined();
    });
  });

  describe("gameCodeExists", () => {
    it("should return true for existing code", () => {
      const { gameCode } = manager.createGame();
      expect(manager.gameCodeExists(gameCode)).toBe(true);
    });

    it("should return false for non-existing code", () => {
      expect(manager.gameCodeExists("NOPE")).toBe(false);
    });
  });

  describe("multiple games", () => {
    it("should manage multiple games independently", () => {
      const g1 = manager.createGame();
      const g2 = manager.createGame();
      expect(g1.gameCode).not.toBe(g2.gameCode);

      const game1 = manager.getGame(g1.gameCode);
      const game2 = manager.getGame(g2.gameCode);
      expect(game1).not.toBe(game2);
    });
  });

  describe("cleanupExpiredGames", () => {
    it("should purge AI conversations and turn tracking for expired games", () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        const { gameCode } = manager.createGame();
        const stale = manager.createGame();
        const game = manager.getGame(stale.gameCode)!;
        game.getState().lastActivityAt = now - 25 * 60 * 60 * 1000;

        const purgeGameSpy = vi.spyOn(llmModule, "purgeGame").mockImplementation(() => {});
        const resetTurnContextSpy = vi.spyOn(runnerModule, "resetTurnContext").mockImplementation(() => {});

        const removed = manager.cleanupExpiredGames();

        expect(removed).toBe(1);
        expect(manager.getGame(stale.gameCode)).toBeUndefined();
        expect(manager.getGame(gameCode)).toBeDefined();
        expect(purgeGameSpy).toHaveBeenCalledWith(stale.gameCode);
        expect(resetTurnContextSpy).toHaveBeenCalledWith(stale.gameCode);
        expect(purgeGameSpy).not.toHaveBeenCalledWith(gameCode);
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    });
  });

  describe("persistence wiring", () => {
    it("should persist via the store when a game is created and mutated", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode)!;
      game.addPlayer("p1", "Alice");
      game.addPlayer("p2", "Bob");
      game.start();

      await vi.waitFor(() => expect(store.upsertGame).toHaveBeenCalledTimes(3));
      expect(store.games.get(gameCode)!.phase).toBe("playing");
    });

    it("should apply rapid upserts in mutation order", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode)!;
      game.addPlayer("p1", "Alice");
      game.addPlayer("p2", "Bob");
      game.start();

      await vi.waitFor(() => expect(store.upsertOrder).toHaveLength(3));
      expect(store.upsertOrder[0].players).toHaveLength(1);
      expect(store.upsertOrder[1].players).toHaveLength(2);
      expect(store.upsertOrder[2].phase).toBe("playing");
    });

    it("should log a failed save and keep persisting later mutations", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const upsertGame = vi
          .fn()
          .mockRejectedValueOnce(new Error("db down"))
          .mockResolvedValue(undefined);
        const store: GameStore = {
          upsertGame,
          loadAllGames: vi.fn(async () => []),
          deleteGame: vi.fn(async () => {}),
          deleteExpiredGames: vi.fn(async () => []),
          close: vi.fn(async () => {}),
        };
        manager.setStore(store);
        const { gameCode } = manager.createGame();
        const game = manager.getGame(gameCode)!;

        game.addPlayer("p1", "Alice");
        await vi.waitFor(() => expect(upsertGame).toHaveBeenCalledTimes(1));

        game.addPlayer("p2", "Bob");
        await vi.waitFor(() => expect(upsertGame).toHaveBeenCalledTimes(2));

        expect(errorSpy).toHaveBeenCalledWith(
          `Failed to persist game ${gameCode}:`,
          expect.any(Error)
        );
        expect(store.loadAllGames).not.toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("should not let a later snapshot overtake a delayed earlier write", async () => {
      const applied: string[] = [];
      let releaseFirst: () => void = () => {};
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let call = 0;
      const upsertGame = vi.fn(async () => {
        call++;
        if (call === 1) {
          await firstGate;
          applied.push("first");
        } else {
          applied.push("second");
        }
      });
      const store: GameStore = {
        upsertGame,
        loadAllGames: vi.fn(async () => []),
        deleteGame: vi.fn(async () => {}),
        deleteExpiredGames: vi.fn(async () => []),
        close: vi.fn(async () => {}),
      };
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode)!;

      game.addPlayer("p1", "Alice");
      game.addPlayer("p2", "Bob");

      await vi.waitFor(() => expect(upsertGame).toHaveBeenCalledTimes(1));
      expect(applied).toEqual([]);

      releaseFirst();
      await vi.waitFor(() => expect(applied).toEqual(["first", "second"]));
    });

    it("should drop the per-game write queue entry once it settles", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      manager.getGame(gameCode)!.addPlayer("p1", "Alice");

      await vi.waitFor(() => expect(store.upsertGame).toHaveBeenCalled());
      const queues = (manager as unknown as { writeQueues: Map<string, Promise<void>> }).writeQueues;
      await vi.waitFor(() => expect(queues.has(gameCode)).toBe(false));
    });

    it("should not enqueue persistence work for the NoopGameStore", async () => {
      manager.setStore(new NoopGameStore());
      const { gameCode } = manager.createGame();
      manager.getGame(gameCode)!.addPlayer("p1", "Alice");

      const queues = (manager as unknown as { writeQueues: Map<string, Promise<void>> }).writeQueues;
      await Promise.resolve();
      expect(queues.size).toBe(0);
    });

    it("should delete expired games from the store during cleanup", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode)!;
      game.addPlayer("p1", "Alice");
      await vi.waitFor(() => expect(store.games.has(gameCode)).toBe(true));
      game.getState().lastActivityAt = Date.now() - 25 * 60 * 60 * 1000;

      const removed = manager.cleanupExpiredGames();
      expect(removed).toBe(1);
      await vi.waitFor(() => expect(store.deleteGame).toHaveBeenCalledWith(gameCode));
      expect(store.games.has(gameCode)).toBe(false);
    });
  });

  describe("restoreGames", () => {
    it("should rebuild the map from the store and mark humans disconnected", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      store.games.set("REST01", makeState("REST01", "playing", Date.now()));

      const restored = await manager.restoreGames();
      expect(restored).toBe(1);

      const game = manager.getGame("REST01")!;
      expect(game.getState().phase).toBe("playing");
      expect(game.getState().players[0].connected).toBe(false);
      expect(game.getState().players[1].connected).toBe(false);
    });

    it("should skip and delete expired rows", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      const now = Date.now();
      store.games.set("OLD01", makeState("OLD01", "playing", now - 25 * 60 * 60 * 1000));
      store.games.set("NEW01", makeState("NEW01", "playing", now));

      const restored = await manager.restoreGames();
      expect(restored).toBe(1);
      expect(manager.getGame("OLD01")).toBeUndefined();
      expect(manager.getGame("NEW01")).toBeDefined();
      expect(store.games.has("OLD01")).toBe(false);
    });

    it("should wire the persist hook on restored games", async () => {
      const store = createFakeStore();
      manager.setStore(store);
      store.games.set("REST01", makeState("REST01", "playing", Date.now()));
      await manager.restoreGames();

      const game = manager.getGame("REST01")!;
      game.setPlayerConnected("p1", true);
      await vi.waitFor(() => expect(store.upsertGame).toHaveBeenCalled());
      expect(store.games.get("REST01")!.players[0].connected).toBe(true);
    });
  });

  describe("unloadAllGames", () => {
    it("should empty the in-memory map", () => {
      const g1 = manager.createGame();
      const g2 = manager.createGame();
      expect(manager.getGame(g1.gameCode)).toBeDefined();
      expect(manager.getGame(g2.gameCode)).toBeDefined();

      manager.unloadAllGames();
      expect(manager.getGame(g1.gameCode)).toBeUndefined();
      expect(manager.getGame(g2.gameCode)).toBeUndefined();
    });
  });

  describe("flushStorage", () => {
    it("should wait for in-flight writes to complete", async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const upsertGame = vi.fn(async () => {
        await gate;
      });
      const store: GameStore = {
        upsertGame,
        loadAllGames: vi.fn(async () => []),
        deleteGame: vi.fn(async () => {}),
        deleteExpiredGames: vi.fn(async () => []),
        close: vi.fn(async () => {}),
      };
      manager.setStore(store);
      const { gameCode } = manager.createGame();
      manager.getGame(gameCode)!.addPlayer("p1", "Alice");
      await vi.waitFor(() => expect(upsertGame).toHaveBeenCalled());

      let flushed = false;
      const flushPromise = manager.flushStorage().then(() => {
        flushed = true;
      });
      await Promise.resolve();
      expect(flushed).toBe(false);

      release();
      await flushPromise;
      expect(flushed).toBe(true);
    });
  });
});

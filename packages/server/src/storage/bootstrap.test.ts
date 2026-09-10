import { describe, it, expect, vi } from "vitest";
import { GameManager } from "../gameManager.js";
import { bootPersistence, reloadGames } from "./bootstrap.js";
import type { GameState, GamePhase } from "@rummikub/shared";

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
  return {
    games,
    upsertGame: vi.fn(async (state: GameState) => {
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

describe("bootPersistence", () => {
  it("should restore games from the store when persistence is enabled", async () => {
    const store = createFakeStore();
    store.games.set("REST01", makeState("REST01", "playing", Date.now()));
    const manager = new GameManager();

    const restored = await bootPersistence(
      manager,
      store,
      { databaseUrl: "postgres://u:p@h:5432/db", enabled: true },
      async () => {}
    );

    expect(restored).toBe(1);
    expect(manager.getGame("REST01")).toBeDefined();
    expect(manager.getGame("REST01")!.getState().phase).toBe("playing");
  });

  it("should not touch the store when persistence is disabled", async () => {
    const store = createFakeStore();
    store.games.set("REST01", makeState("REST01", "playing", Date.now()));
    const manager = new GameManager();

    const restored = await bootPersistence(manager, store, { databaseUrl: "", enabled: false });

    expect(restored).toBe(0);
    expect(manager.getGame("REST01")).toBeUndefined();
    expect(store.loadAllGames).not.toHaveBeenCalled();
  });
});

describe("reloadGames", () => {
  it("should unload in-memory games and restore them from the store", async () => {
    const store = createFakeStore();
    store.games.set("REST01", makeState("REST01", "playing", Date.now()));
    const manager = new GameManager();
    manager.setStore(store);
    const created = manager.createGame();
    expect(manager.getGame(created.gameCode)).toBeDefined();

    const restored = await reloadGames(manager);

    expect(restored).toBe(1);
    expect(manager.getGame(created.gameCode)).toBeUndefined();
    expect(manager.getGame("REST01")).toBeDefined();
  });
});

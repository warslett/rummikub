import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameManager } from "../gameManager.js";
import { bootPersistence, reloadGames } from "./bootstrap.js";
import type { GameState, GamePhase } from "@rummikub/shared";
import * as runnerModule from "../ai/runner.js";
import * as llmModule from "../ai/providers/llm.js";
import * as debugModule from "../ai/debug.js";
import * as aiStoreModule from "./aiStore.js";
import { NoopAiStore, queueAiWrite, _clearAiWriteQueues } from "./aiStore.js";

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
      async () => {},
      new NoopAiStore()
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

describe("bootPersistence AI restore", () => {
  beforeEach(() => {
    _clearAiWriteQueues();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearAiWriteQueues();
    aiStoreModule.setAiStore(new NoopAiStore());
  });

  it("should wire the AI store and restore AI state after games when enabled", async () => {
    const setAiStoreSpy = vi.spyOn(aiStoreModule, "setAiStore");
    const restoreAiStateSpy = vi.spyOn(runnerModule, "restoreAiState").mockResolvedValue();
    const restoreTranscriptsSpy = vi.spyOn(debugModule, "restoreTranscripts").mockResolvedValue();
    const restoreConversationsSpy = vi.spyOn(llmModule, "restoreConversations").mockResolvedValue();

    const store = createFakeStore();
    store.games.set("REST01", makeState("REST01", "playing", Date.now()));
    const manager = new GameManager();
    const aiStore = new NoopAiStore();

    const restored = await bootPersistence(
      manager,
      store,
      { databaseUrl: "postgres://u:p@h:5432/db", enabled: true },
      async () => {},
      aiStore
    );

    expect(restored).toBe(1);
    expect(setAiStoreSpy).toHaveBeenCalledWith(aiStore);
    expect(restoreAiStateSpy).toHaveBeenCalled();
    expect(restoreTranscriptsSpy).toHaveBeenCalled();
    expect(restoreConversationsSpy).toHaveBeenCalled();
    expect(restoreAiStateSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
      store.loadAllGames.mock.invocationCallOrder[0]
    );
  });

  it("should not restore AI state when persistence is disabled", async () => {
    const restoreAiStateSpy = vi.spyOn(runnerModule, "restoreAiState").mockResolvedValue();
    const restoreTranscriptsSpy = vi.spyOn(debugModule, "restoreTranscripts").mockResolvedValue();
    const restoreConversationsSpy = vi.spyOn(llmModule, "restoreConversations").mockResolvedValue();

    const manager = new GameManager();
    const restored = await bootPersistence(manager, createFakeStore(), { databaseUrl: "", enabled: false });

    expect(restored).toBe(0);
    expect(restoreAiStateSpy).not.toHaveBeenCalled();
    expect(restoreTranscriptsSpy).not.toHaveBeenCalled();
    expect(restoreConversationsSpy).not.toHaveBeenCalled();
  });

  it("should reload AI state after unloading it in reloadGames", async () => {
    const unloadAiStateSpy = vi.spyOn(runnerModule, "unloadAiState").mockImplementation(() => {});
    const restoreAiStateSpy = vi.spyOn(runnerModule, "restoreAiState").mockResolvedValue();
    const unloadTranscriptsSpy = vi.spyOn(debugModule, "unloadTranscripts").mockImplementation(() => {});
    const restoreTranscriptsSpy = vi.spyOn(debugModule, "restoreTranscripts").mockResolvedValue();
    const unloadConversationsSpy = vi
      .spyOn(llmModule, "unloadConversations")
      .mockImplementation(() => {});
    const restoreConversationsSpy = vi.spyOn(llmModule, "restoreConversations").mockResolvedValue();

    const store = createFakeStore();
    store.games.set("REST01", makeState("REST01", "playing", Date.now()));
    const manager = new GameManager();
    manager.setStore(store);

    const restored = await reloadGames(manager);

    expect(restored).toBe(1);
    expect(unloadAiStateSpy).toHaveBeenCalled();
    expect(unloadTranscriptsSpy).toHaveBeenCalled();
    expect(unloadConversationsSpy).toHaveBeenCalled();
    expect(restoreAiStateSpy).toHaveBeenCalled();
    expect(restoreTranscriptsSpy).toHaveBeenCalled();
    expect(restoreConversationsSpy).toHaveBeenCalled();
    expect(unloadAiStateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      restoreAiStateSpy.mock.invocationCallOrder[0]
    );
  });

  it("should drain pending AI writes before unloading AI state in reloadGames", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let applied = false;
    queueAiWrite("aitracking:PEND01", async () => {
      await gate;
      applied = true;
    });

    const unloadAiStateSpy = vi.spyOn(runnerModule, "unloadAiState").mockImplementation(() => {});
    vi.spyOn(runnerModule, "restoreAiState").mockResolvedValue();
    vi.spyOn(debugModule, "unloadTranscripts").mockImplementation(() => {});
    vi.spyOn(debugModule, "restoreTranscripts").mockResolvedValue();
    vi.spyOn(llmModule, "unloadConversations").mockImplementation(() => {});
    vi.spyOn(llmModule, "restoreConversations").mockResolvedValue();

    const manager = new GameManager();
    manager.setStore(createFakeStore());

    const reload = reloadGames(manager);
    await Promise.resolve();
    expect(applied).toBe(false);
    expect(unloadAiStateSpy).not.toHaveBeenCalled();

    release();
    await reload;
    expect(applied).toBe(true);
    expect(unloadAiStateSpy).toHaveBeenCalled();
  });
});

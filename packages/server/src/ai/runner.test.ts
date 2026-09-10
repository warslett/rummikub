import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../game.js";
import {
  maybeRunNextTurn,
  resetTurnContext,
  resetAiErrors,
  restoreAiState,
  unloadAiState,
  purgeAiState,
  resumePendingAiTurns,
  _resetAiRunnerState,
} from "./runner.js";
import * as providersModule from "./providers/index.js";
import type { TurnContext } from "./providers/types.js";
import {
  setAiStore,
  flushAiWrites,
  _clearAiWriteQueues,
  NoopAiStore,
} from "../storage/aiStore.js";
import type { AiTurnTrackingData, AiTurnTrackingRecord, AiErrorRecord } from "../storage/aiStore.js";

class FakeAiStore extends NoopAiStore {
  tracking = new Map<string, AiTurnTrackingData>();
  errors = new Map<string, AiErrorRecord>();

  override async upsertTurnTracking(gameCode: string, data: AiTurnTrackingData): Promise<void> {
    this.tracking.set(gameCode, JSON.parse(JSON.stringify(data)) as AiTurnTrackingData);
  }

  override async loadAllTurnTracking(): Promise<AiTurnTrackingRecord[]> {
    return [...this.tracking.entries()].map(([gameCode, data]) => ({
      gameCode,
      data: JSON.parse(JSON.stringify(data)) as AiTurnTrackingData,
    }));
  }

  override async deleteTurnTracking(gameCode: string): Promise<void> {
    this.tracking.delete(gameCode);
  }

  override async upsertAiError(gameCode: string, playerId: string, message: string): Promise<void> {
    this.errors.set(`${gameCode}:${playerId}`, { gameCode, playerId, message });
  }

  override async loadAllAiErrors(): Promise<AiErrorRecord[]> {
    return [...this.errors.values()].map((record) => ({ ...record }));
  }

  override async deleteAiError(gameCode: string, playerId: string): Promise<void> {
    this.errors.delete(`${gameCode}:${playerId}`);
  }

  override async deleteGameAiErrors(gameCode: string): Promise<void> {
    for (const key of [...this.errors.keys()]) {
      if (key.startsWith(`${gameCode}:`)) {
        this.errors.delete(key);
      }
    }
  }
}

function createStubIo() {
  const emittedEvents: { event: string; data: unknown }[] = [];
  const roomEmitter = {
    emit: vi.fn((event: string, data: unknown) => {
      emittedEvents.push({ event, data });
    }),
  };
  return {
    to: vi.fn().mockReturnValue(roomEmitter),
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
      sockets: new Map(),
    },
    _emittedEvents: emittedEvents,
  } as unknown as SocketIOServer & { _emittedEvents: { event: string; data: unknown }[] };
}

describe("AiTurnRunner", () => {
  let game: Game;
  let io: SocketIOServer & { _emittedEvents: { event: string; data: unknown }[] };

  beforeEach(() => {
    _resetAiRunnerState();
    io = createStubIo();
    game = new Game("TEST01");
  });

  it("should not invoke provider when current player is human", async () => {
    game.addPlayer("p1", "Alice");
    game.addAiPlayer("test-model");
    game.start();

    // p1 is index 0 (human)
    const getProviderSpy = vi.spyOn(providersModule, "getProvider");
    await maybeRunNextTurn(io, game, "TEST01");

    expect(getProviderSpy).not.toHaveBeenCalled();
    getProviderSpy.mockRestore();
  });

  it("should invoke provider when current player is AI", async () => {
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("test-model");
    game.start();
    game.seedGame({
      board: [],
      racks: {
        p1: [{ id: "black-1-a", color: "black", value: 1 }],
        [ai.id]: [{ id: "black-2-a", color: "black", value: 2 }],
      },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { p1: true, [ai.id]: true },
    });

    await maybeRunNextTurn(io, game, "TEST01");

    // AI should have drawn and turn advanced to p1
    expect(game.getPlayerState(ai.id).isYourTurn).toBe(false);
  });

  it("should handle chained AI turns", async () => {
    game.addPlayer("p1", "Alice");
    const ai1 = game.addAiPlayer("model-1");
    const ai2 = game.addAiPlayer("model-2");
    game.start();

    // Seed so AI1 is current turn, then AI2 is next
    game.seedGame({
      board: [],
      racks: {
        p1: [{ id: "black-1-a", color: "black", value: 1 }],
        [ai1.id]: [{ id: "black-2-a", color: "black", value: 2 }],
        [ai2.id]: [{ id: "black-3-a", color: "black", value: 3 }],
      },
      pool: [
        { id: "red-1-a", color: "red", value: 1 },
        { id: "red-2-a", color: "red", value: 2 },
      ],
      currentTurnPlayerId: ai1.id,
      hasInitialMeld: { p1: true, [ai1.id]: true, [ai2.id]: true },
    });

    await maybeRunNextTurn(io, game, "TEST01");

    // Both AI1 and AI2 should have drawn, turn should now be Alice (p1)
    expect(game.getPlayerState("p1").isYourTurn).toBe(true);
    expect(game.getPlayerState(ai1.id).yourRack).toHaveLength(2);
    expect(game.getPlayerState(ai2.id).yourRack).toHaveLength(2);
  });

  it("should emit ai:error on provider failure and not re-trigger that player", async () => {
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("failing-model");
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [ai.id]: [] },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { p1: true, [ai.id]: true },
    });

    const failingProvider = {
      takeTurn: vi.fn().mockRejectedValue(new Error("Model hallucinated invalid move")),
    };
    const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(failingProvider);

    await maybeRunNextTurn(io, game, "TEST01");

    const errorEvent = io._emittedEvents.find((e) => e.event === "ai:error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent?.data as { playerId: string }).playerId).toBe(ai.id);
    expect((errorEvent?.data as { message: string }).message).toBe("Model hallucinated invalid move");

    // Re-triggering should do nothing because player is in error state
    failingProvider.takeTurn.mockClear();
    await maybeRunNextTurn(io, game, "TEST01");
    expect(failingProvider.takeTurn).not.toHaveBeenCalled();

    getProviderSpy.mockRestore();
  });

  it("should clear AI errors for a game on resetAiErrors", async () => {
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("failing-model");
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [ai.id]: [] },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { p1: true, [ai.id]: true },
    });

    const failingProvider = {
      takeTurn: vi.fn().mockRejectedValue(new Error("Model hallucinated invalid move")),
    };
    const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(failingProvider);

    await maybeRunNextTurn(io, game, "TEST01");
    const errorEvent = io._emittedEvents.find((e) => e.event === "ai:error");
    expect(errorEvent).toBeDefined();

    failingProvider.takeTurn.mockClear();
    await maybeRunNextTurn(io, game, "TEST01");
    expect(failingProvider.takeTurn).not.toHaveBeenCalled();

    resetAiErrors("TEST01");
    await maybeRunNextTurn(io, game, "TEST01");
    expect(failingProvider.takeTurn).toHaveBeenCalled();

    getProviderSpy.mockRestore();
  });

  it("should not double-run when already busy", async () => {
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("slow-model");
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [{ id: "b1", color: "black", value: 1 }], [ai.id]: [] },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { p1: true, [ai.id]: true },
    });

    let slowProviderCalls = 0;
    const slowProvider = {
      takeTurn: vi.fn().mockImplementation(async () => {
        slowProviderCalls++;
        // While running, attempt another maybeRunNextTurn
        await maybeRunNextTurn(io, game, "TEST01");
      }),
    };
    const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(slowProvider);

    await maybeRunNextTurn(io, game, "TEST01");

    expect(slowProviderCalls).toBe(1);
    getProviderSpy.mockRestore();
  });

  it("should emit ai:error when provider finishes takeTurn without advancing turn", async () => {
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("lazy-model");
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [ai.id]: [] },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { p1: true, [ai.id]: true },
    });

    const lazyProvider = {
      takeTurn: vi.fn().mockResolvedValue(undefined),
    };
    const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(lazyProvider);

    await maybeRunNextTurn(io, game, "TEST01");

    const errorEvent = io._emittedEvents.find((e) => e.event === "ai:error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent?.data as { playerId: string }).playerId).toBe(ai.id);
    expect((errorEvent?.data as { message: string }).message).toBe("AI completed turn without ending it or passing");

    lazyProvider.takeTurn.mockClear();
    await maybeRunNextTurn(io, game, "TEST01");
    expect(lazyProvider.takeTurn).not.toHaveBeenCalled();

    getProviderSpy.mockRestore();
  });

  describe("turn context", () => {
    const P1_TILE = { id: "black-1-a", color: "black" as const, value: 1 as const };

    function seedAiTurn(aiId: string, poolTiles: { id: string; color: "red"; value: 1 | 2 | 3 | 4 | 5 }[]) {
      game.seedGame({
        board: [],
        racks: { p1: [P1_TILE], [aiId]: [] },
        pool: poolTiles,
        currentTurnPlayerId: aiId,
        hasInitialMeld: { p1: true, [aiId]: true },
      });
    }

    function createContextCapturingProvider(contexts: (TurnContext | undefined)[]) {
      return {
        takeTurn: vi.fn().mockImplementation(async (controller: { drawTile(): unknown }, context?: TurnContext) => {
          contexts.push(context);
          controller.drawTile();
        }),
      };
    }

    it("should pass turn number and empty events note on the first AI turn", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedAiTurn(ai.id, [{ id: "red-1-a", color: "red", value: 1 }]);

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(1);
      expect(contexts[0]?.turnNumber).toBe(1);
      expect(contexts[0]?.eventsNote).toBe("");

      getProviderSpy.mockRestore();
    });

    it("should include the previous AI's draw in the events note of a chained AI turn", async () => {
      game.addPlayer("p1", "Alice");
      const ai1 = game.addAiPlayer("model-1");
      const ai2 = game.addAiPlayer("model-2");
      game.start();
      game.seedGame({
        board: [],
        racks: { p1: [P1_TILE], [ai1.id]: [], [ai2.id]: [{ id: "black-2-a", color: "black", value: 2 }] },
        pool: [
          { id: "red-1-a", color: "red", value: 1 },
          { id: "red-2-a", color: "red", value: 2 },
        ],
        currentTurnPlayerId: ai1.id,
        hasInitialMeld: { p1: true, [ai1.id]: true, [ai2.id]: true },
      });

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(2);
      expect(contexts[1]?.turnNumber).toBe(2);
      expect(contexts[1]?.eventsNote).toContain(`${ai1.name} drew a tile`);

      getProviderSpy.mockRestore();
    });

    it("should include the human's move in the events note of the next AI turn", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedAiTurn(ai.id, [
        { id: "red-1-a", color: "red", value: 1 },
        { id: "red-2-a", color: "red", value: 2 },
        { id: "red-3-a", color: "red", value: 3 },
      ]);

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");

      // Human (Alice) now draws, then the AI's next turn is triggered
      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(2);
      expect(contexts[1]?.turnNumber).toBe(2);
      expect(contexts[1]?.eventsNote).toContain("Alice drew a tile");

      getProviderSpy.mockRestore();
    });

    it("should include every opponent's events in each AI's events note", async () => {
      game.addPlayer("p1", "Alice");
      const ai1 = game.addAiPlayer("model-1");
      const ai2 = game.addAiPlayer("model-2");
      game.start();
      game.seedGame({
        board: [],
        racks: {
          p1: [P1_TILE],
          [ai1.id]: [],
          [ai2.id]: [{ id: "black-2-a", color: "black", value: 2 }],
        },
        pool: [
          { id: "red-1-a", color: "red", value: 1 },
          { id: "red-2-a", color: "red", value: 2 },
          { id: "red-3-a", color: "red", value: 3 },
          { id: "red-4-a", color: "red", value: 4 },
        ],
        currentTurnPlayerId: ai1.id,
        hasInitialMeld: { p1: true, [ai1.id]: true, [ai2.id]: true },
      });

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      // AI1 (turn 1) and AI2 (turn 2) draw back-to-back, then it is Alice's turn
      await maybeRunNextTurn(io, game, "TEST01");
      // Alice draws, then AI1 (turn 3) and AI2 (turn 4) draw again
      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(4);
      expect(contexts[2]?.eventsNote).toContain(`${ai2.name} drew a tile`);
      expect(contexts[2]?.eventsNote).toContain("Alice drew a tile");
      expect(contexts[3]?.eventsNote).toContain("Alice drew a tile");
      expect(contexts[3]?.eventsNote).toContain(`${ai1.name} drew a tile`);

      getProviderSpy.mockRestore();
    });

    it("should describe an opponent's play as board changes rather than a tile count", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      game.seedGame({
        board: [],
        racks: {
          p1: [
            { id: "red-10-a", color: "red", value: 10 },
            { id: "red-11-a", color: "red", value: 11 },
            { id: "red-12-a", color: "red", value: 12 },
          ],
          [ai.id]: [],
        },
        pool: [
          { id: "red-1-a", color: "red", value: 1 },
          { id: "red-2-a", color: "red", value: 2 },
        ],
        currentTurnPlayerId: ai.id,
        hasInitialMeld: { p1: true, [ai.id]: true },
      });

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");
      game.playSets("p1", [
        {
          id: "s1",
          tiles: [
            { id: "red-10-a", color: "red", value: 10 },
            { id: "red-11-a", color: "red", value: 11 },
            { id: "red-12-a", color: "red", value: 12 },
          ],
        },
      ]);
      game.endTurn("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts[1]?.eventsNote).toContain("Alice made changes to the board and ended his turn");
      expect(contexts[1]?.eventsNote).not.toContain("tile set");

      getProviderSpy.mockRestore();
    });

    it("should note board changes even when rack sizes are unchanged", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedAiTurn(ai.id, [{ id: "red-1-a", color: "red", value: 1 }]);

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");

      game.seedGame({
        board: [
          {
            id: "s1",
            tiles: [
              { id: "red-7-a", color: "red", value: 7 },
              { id: "red-8-a", color: "red", value: 8 },
              { id: "red-9-a", color: "red", value: 9 },
            ],
          },
        ],
        racks: { p1: [P1_TILE], [ai.id]: [] },
        pool: [{ id: "red-2-a", color: "red", value: 2 }],
        currentTurnPlayerId: ai.id,
        hasInitialMeld: { p1: true, [ai.id]: true },
      });
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(2);
      expect(contexts[1]?.eventsNote).toContain("the board changed");

      getProviderSpy.mockRestore();
    });

    it("should reset the turn counter and events on resetTurnContext", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedAiTurn(ai.id, [
        { id: "red-1-a", color: "red", value: 1 },
        { id: "red-2-a", color: "red", value: 2 },
        { id: "red-3-a", color: "red", value: 3 },
        { id: "red-4-a", color: "red", value: 4 },
        { id: "red-5-a", color: "red", value: 5 },
      ]);

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");
      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");
      expect(contexts[1]?.turnNumber).toBe(2);

      resetTurnContext("TEST01");
      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts[2]?.turnNumber).toBe(1);
      expect(contexts[2]?.eventsNote).toBe("");

      getProviderSpy.mockRestore();
    });

    it("should reset tracking when the round number changes", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedAiTurn(ai.id, [
        { id: "red-1-a", color: "red", value: 1 },
        { id: "red-2-a", color: "red", value: 2 },
        { id: "red-3-a", color: "red", value: 3 },
      ]);

      const contexts: (TurnContext | undefined)[] = [];
      const stubProvider = createContextCapturingProvider(contexts);
      const getProviderSpy = vi.spyOn(providersModule, "getProvider").mockReturnValue(stubProvider);

      await maybeRunNextTurn(io, game, "TEST01");

      // Simulate a new round (Play Again increments roundNumber)
      game.getState().roundNumber = 2;
      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts[1]?.turnNumber).toBe(1);
      expect(contexts[1]?.eventsNote).toBe("");

      getProviderSpy.mockRestore();
    });
  });

  describe("persistence", () => {
    let store: FakeAiStore;

    beforeEach(() => {
      _clearAiWriteQueues();
      store = new FakeAiStore();
      setAiStore(store);
    });

    afterEach(() => {
      setAiStore(new NoopAiStore());
      _clearAiWriteQueues();
    });

    function seedDrawTurn(aiId: string) {
      game.seedGame({
        board: [],
        racks: { p1: [{ id: "black-1-a", color: "black", value: 1 }], [aiId]: [] },
        pool: [
          { id: "red-1-a", color: "red", value: 1 },
          { id: "red-2-a", color: "red", value: 2 },
        ],
        currentTurnPlayerId: aiId,
        hasInitialMeld: { p1: true, [aiId]: true },
      });
    }

    function createDrawingProvider(contexts: (TurnContext | undefined)[]) {
      return {
        takeTurn: vi.fn().mockImplementation(async (controller: { drawTile(): unknown }, context?: TurnContext) => {
          contexts.push(context);
          controller.drawTile();
        }),
      };
    }

    it("should persist turn tracking and continue turn numbering after a restore", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedDrawTurn(ai.id);

      const contexts: (TurnContext | undefined)[] = [];
      const provider = createDrawingProvider(contexts);
      const spy = vi.spyOn(providersModule, "getProvider").mockReturnValue(provider);

      await maybeRunNextTurn(io, game, "TEST01");
      await flushAiWrites();
      expect(store.tracking.get("TEST01")?.turnNumber).toBe(1);

      unloadAiState();
      await restoreAiState();

      game.drawTile("p1");
      await maybeRunNextTurn(io, game, "TEST01");

      expect(contexts).toHaveLength(2);
      expect(contexts[1]?.turnNumber).toBe(2);
      spy.mockRestore();
    });

    it("should persist an AI error and keep the game paused after a restore", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("failing-model");
      game.start();
      seedDrawTurn(ai.id);

      const failingProvider = {
        takeTurn: vi.fn().mockRejectedValue(new Error("boom")),
      };
      const spy = vi.spyOn(providersModule, "getProvider").mockReturnValue(failingProvider);

      await maybeRunNextTurn(io, game, "TEST01");
      await flushAiWrites();
      expect(store.errors.get(`TEST01:${ai.id}`)?.message).toBe("boom");

      unloadAiState();
      await restoreAiState();

      failingProvider.takeTurn.mockClear();
      await maybeRunNextTurn(io, game, "TEST01");
      expect(failingProvider.takeTurn).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("should delete persisted turn tracking and errors on reset", async () => {
      store.tracking.set("TEST01", {
        roundNumber: 1,
        turnNumber: 2,
        baseline: { boardTileCount: 0, consecutivePasses: 0, rackSizes: {} },
        observations: {},
      });
      store.errors.set("TEST01:ai1", { gameCode: "TEST01", playerId: "ai1", message: "boom" });

      resetTurnContext("TEST01");
      resetAiErrors("TEST01");
      await flushAiWrites();

      expect(store.tracking.has("TEST01")).toBe(false);
      expect(store.errors.size).toBe(0);
    });

    it("should purge all persisted AI state for a game on purgeAiState", async () => {
      store.tracking.set("TEST01", {
        roundNumber: 1,
        turnNumber: 2,
        baseline: { boardTileCount: 0, consecutivePasses: 0, rackSizes: {} },
        observations: {},
      });
      store.errors.set("TEST01:ai1", { gameCode: "TEST01", playerId: "ai1", message: "boom" });
      store.tracking.set("OTHER1", {
        roundNumber: 1,
        turnNumber: 1,
        baseline: { boardTileCount: 0, consecutivePasses: 0, rackSizes: {} },
        observations: {},
      });

      purgeAiState("TEST01");
      await flushAiWrites();

      expect(store.tracking.has("TEST01")).toBe(false);
      expect(store.tracking.has("OTHER1")).toBe(true);
      expect(store.errors.size).toBe(0);
    });
  });

  describe("resumePendingAiTurns", () => {
    function seedDrawTurn(aiId: string) {
      game.seedGame({
        board: [],
        racks: { p1: [{ id: "black-1-a", color: "black", value: 1 }], [aiId]: [] },
        pool: [
          { id: "red-1-a", color: "red", value: 1 },
          { id: "red-2-a", color: "red", value: 2 },
        ],
        currentTurnPlayerId: aiId,
        hasInitialMeld: { p1: true, [aiId]: true },
      });
    }

    it("should run a turn for a restored game whose current player is AI", async () => {
      game.addPlayer("p1", "Alice");
      const ai = game.addAiPlayer("test-model");
      game.start();
      seedDrawTurn(ai.id);

      const provider = {
        takeTurn: vi.fn().mockImplementation(async (controller: { drawTile(): unknown }) => {
          controller.drawTile();
        }),
      };
      const spy = vi.spyOn(providersModule, "getProvider").mockReturnValue(provider);

      await resumePendingAiTurns(io, [game]);

      expect(provider.takeTurn).toHaveBeenCalledTimes(1);
      expect(game.getPlayerState("p1").isYourTurn).toBe(true);
      spy.mockRestore();
    });

    it("should not run for a game whose current player is human", async () => {
      game.addPlayer("p1", "Alice");
      game.addAiPlayer("test-model");
      game.start();

      const getProviderSpy = vi.spyOn(providersModule, "getProvider");
      await resumePendingAiTurns(io, [game]);

      expect(getProviderSpy).not.toHaveBeenCalled();
      getProviderSpy.mockRestore();
    });

    it("should not run when the current AI player has a persisted error", async () => {
      const store = new FakeAiStore();
      setAiStore(store);
      try {
        game.addPlayer("p1", "Alice");
        const ai = game.addAiPlayer("failing-model");
        game.start();
        seedDrawTurn(ai.id);
        store.errors.set(`TEST01:${ai.id}`, { gameCode: "TEST01", playerId: ai.id, message: "boom" });
        await restoreAiState();

        const provider = { takeTurn: vi.fn() };
        const spy = vi.spyOn(providersModule, "getProvider").mockReturnValue(provider);

        await resumePendingAiTurns(io, [game]);

        expect(provider.takeTurn).not.toHaveBeenCalled();
        spy.mockRestore();
      } finally {
        setAiStore(new NoopAiStore());
      }
    });
  });
});

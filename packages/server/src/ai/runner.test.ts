import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../game.js";
import { maybeRunNextTurn, resetTurnContext, _resetAiRunnerState } from "./runner.js";
import * as providersModule from "./providers/index.js";
import type { TurnContext } from "./providers/types.js";

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
});

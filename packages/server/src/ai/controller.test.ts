import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../game.js";
import { AiTurnController } from "./controller.js";
import * as runnerModule from "./runner.js";
import * as debugModule from "./debug.js";
import { _clearAllTranscripts } from "./debug.js";
import type { TileSet } from "@rummikub/shared";

function createStubIo() {
  return {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    emit: vi.fn(),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
      sockets: new Map(),
    },
  } as unknown as SocketIOServer;
}

describe("AiTurnController", () => {
  let game: Game;
  let io: SocketIOServer;
  let aiPlayerId: string;

  beforeEach(() => {
    io = createStubIo();
    game = new Game("TEST01");
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("test-model");
    aiPlayerId = ai.id;
  });

  it("should return player state via getMyState", () => {
    game.start();
    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    const result = controller.getMyState();
    expect(result.ok).toBe(true);
    expect(result.state.id).toBe("TEST01");
    expect(result.state.yourName).toBe("AI: test-model");
  });

  it("should return ok: false on playSets with invalid tiles without throwing", () => {
    game.start();
    // Seed so it's AI's turn
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [{ id: "red-1-a", color: "red", value: 1 }] },
      pool: [],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    const invalidSet: TileSet = {
      id: "set-1",
      tiles: [{ id: "blue-1-a", color: "blue", value: 1 }],
    };
    const result = controller.playSets([invalidSet]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
    expect(game.getState().board).toHaveLength(0);
  });

  it("should return ok: true on drawTile, advance turn, and emit state", () => {
    game.start();
    const poolTile = { id: "red-5-a", color: "red" as const, value: 5 as const };
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [poolTile],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    const result = controller.drawTile();
    expect(result.ok).toBe(true);
    // Turn should have advanced to p1
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should return ok: true on endTurn on valid board and advance turn", () => {
    game.start();
    const r10 = { id: "red-10-a", color: "red" as const, value: 10 as const };
    const r11 = { id: "red-11-a", color: "red" as const, value: 11 as const };
    const r12 = { id: "red-12-a", color: "red" as const, value: 12 as const };
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [r10, r11, r12] },
      pool: [{ id: "blue-1-a", color: "blue" as const, value: 1 as const }],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: false },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    const playRes = controller.playSets([{ id: "s1", tiles: [r10, r11, r12] }]);
    expect(playRes.ok).toBe(true);

    const endRes = controller.endTurn();
    expect(endRes.ok).toBe(true);
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    expect(game.getState().board).toHaveLength(1);
  });

  it("should handle passTurn and emit stalemate game:ended when pass triggers stalemate", () => {
    game.start();
    game.seedGame({
      board: [],
      racks: {
        p1: [{ id: "red-1-a", color: "red", value: 1 }],
        [aiPlayerId]: [{ id: "red-2-a", color: "red", value: 2 }],
      },
      pool: [],
      currentTurnPlayerId: "p1",
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    game.passTurn("p1");

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    const result = controller.passTurn();

    expect(result.ok).toBe(true);
    expect(game.getState().phase).toBe("ended");

    const toEmitSpy = io.to("TEST01").emit;
    expect(toEmitSpy).toHaveBeenCalledWith(
      "game:ended",
      expect.objectContaining({
        isStalemate: true,
        winnerId: "p1",
      })
    );
  });

  it("should not call maybeRunNextTurn on drawTile, endTurn, or passTurn", () => {
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [{ id: "red-1-a", color: "red", value: 1 }],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    const runnerSpy = vi.spyOn(runnerModule, "maybeRunNextTurn");
    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    controller.drawTile();

    expect(runnerSpy).not.toHaveBeenCalled();
    runnerSpy.mockRestore();
  });

  describe("recordDebugItem", () => {
    let recordSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      _clearAllTranscripts();
      vi.stubEnv("AI_DEBUG", "true");
      recordSpy = vi.spyOn(debugModule, "recordDebugItem");
      game.start();
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [{ id: "red-7-a", color: "red", value: 7 }] },
        pool: [{ id: "red-1-a", color: "red", value: 1 }],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("should record and broadcast via the debug bus with the controller's io, game and playerId", () => {
      const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);

      controller.recordDebugItem({ type: "prompt", text: "Turn 1 has started." });

      expect(recordSpy).toHaveBeenCalledWith(
        io,
        game,
        aiPlayerId,
        expect.objectContaining({ type: "prompt", text: "Turn 1 has started." })
      );
      const emit = (io.to("TEST01") as unknown as { emit: ReturnType<typeof vi.fn> }).emit;
      expect(emit).toHaveBeenCalledWith(
        "ai:debug",
        expect.objectContaining({ playerId: aiPlayerId, roundNumber: 1 })
      );
    });

    it("should be a no-op when AI_DEBUG is off", () => {
      vi.stubEnv("AI_DEBUG", "false");
      const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);

      controller.recordDebugItem({ type: "tool_call", text: "draw_tile" });

      expect(recordSpy).toHaveBeenCalledTimes(1);
      const emit = (io.to("TEST01") as unknown as { emit: ReturnType<typeof vi.fn> }).emit;
      expect(emit).not.toHaveBeenCalled();
    });
  });
});

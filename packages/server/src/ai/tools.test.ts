import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../game.js";
import { AiTurnController } from "./controller.js";
import { executeTool, toolSchemas } from "./tools.js";

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

const R7 = { id: "red-7-a", color: "red" as const, value: 7 as const };
const R8 = { id: "red-8-a", color: "red" as const, value: 8 as const };
const R9 = { id: "red-9-a", color: "red" as const, value: 9 as const };
const B7 = { id: "blue-7-a", color: "blue" as const, value: 7 as const };
const K7 = { id: "black-7-a", color: "black" as const, value: 7 as const };
const POOL_TILE = { id: "blue-2-a", color: "blue" as const, value: 2 as const };

describe("toolSchemas", () => {
  it("should define all 7 tools", () => {
    const names = toolSchemas.map((t) => t.function.name);
    expect(names).toEqual([
      "get_game_state",
      "play_sets",
      "manipulate_board",
      "undo_turn",
      "draw_tile",
      "end_turn",
      "pass_turn",
    ]);
  });

  it("should make end_turn newBoard parameter optional", () => {
    const endTurn = toolSchemas.find((t) => t.function.name === "end_turn");
    expect(endTurn?.function.parameters.required ?? []).not.toContain("newBoard");
  });
});

describe("executeTool", () => {
  let game: Game;
  let io: SocketIOServer;
  let aiPlayerId: string;
  let controller: AiTurnController;

  beforeEach(() => {
    io = createStubIo();
    game = new Game("TEST01");
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("test-model");
    aiPlayerId = ai.id;
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7, R8, R9] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
  });

  describe("get_game_state", () => {
    it("should return ok with own rack, board, pool size and opponents", () => {
      const outcome = executeTool(controller, "get_game_state", {});
      const parsed = JSON.parse(outcome.content) as {
        ok: boolean;
        state: {
          rack: { id: string }[];
          board: unknown[];
          poolSize: number;
          hasInitialMeld: boolean;
          opponents: { name: string; rackSize: number; score: number }[];
        };
      };

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(false);
      expect(parsed.ok).toBe(true);
      expect(parsed.state.rack.map((t) => t.id)).toEqual(["red-7-a", "red-8-a", "red-9-a"]);
      expect(parsed.state.poolSize).toBe(1);
      expect(parsed.state.hasInitialMeld).toBe(true);
      expect(parsed.state.opponents).toEqual([{ name: "Alice", rackSize: 0, score: 0 }]);
    });

    it("should not reveal opponent racks", () => {
      const outcome = executeTool(controller, "get_game_state", {});
      const parsed = JSON.parse(outcome.content) as { state: { opponents: Record<string, unknown>[] } };
      for (const opponent of parsed.state.opponents) {
        expect(opponent.rack).toBeUndefined();
        expect(opponent.tiles).toBeUndefined();
      }
    });
  });

  describe("play_sets", () => {
    it("should place sets from rack and return the updated state", () => {
      const outcome = executeTool(
        controller,
        "play_sets",
        JSON.stringify({ sets: [{ id: "s1", tiles: [R7, R8, R9] }] })
      );
      const parsed = JSON.parse(outcome.content) as { ok: boolean; state: { rack: unknown[]; board: { tiles: { id: string }[] }[] } };

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(false);
      expect(parsed.state.rack).toHaveLength(0);
      expect(parsed.state.board).toHaveLength(1);
      expect(game.getState().board).toHaveLength(1);
    });

    it("should auto-generate set id when omitted", () => {
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ tiles: [R7, R8, R9] }] }));
      const boardSet = game.getState().board[0];
      expect(boardSet.id).toMatch(/^set-\d+-0$/);
    });

    it("should auto-generate ids for multiple sets", () => {
      const B3 = { id: "blue-3-a", color: "blue" as const, value: 3 as const };
      const B4 = { id: "blue-4-a", color: "blue" as const, value: 4 as const };
      const B5 = { id: "blue-5-a", color: "blue" as const, value: 5 as const };
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7, R8, R9, B3, B4, B5] },
        pool: [POOL_TILE],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });

      const outcome = executeTool(
        controller,
        "play_sets",
        JSON.stringify({ sets: [{ tiles: [R7, R8, R9] }, { tiles: [B3, B4, B5] }] })
      );

      expect(outcome.ok).toBe(true);
      const ids = game.getState().board.map((s) => s.id);
      expect(ids[0]).toMatch(/^set-\d+-0$/);
      expect(ids[1]).toMatch(/^set-\d+-1$/);
    });

    it("should surface controller rejection verbatim", () => {
      const outcome = executeTool(
        controller,
        "play_sets",
        JSON.stringify({ sets: [{ id: "s1", tiles: [{ id: "nope", color: "red", value: 1 }] }] })
      );
      const parsed = JSON.parse(outcome.content) as { ok: boolean; error: string };

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBe("Tile not in player's rack");
    });

    it("should reject non-array sets", () => {
      const outcome = executeTool(controller, "play_sets", JSON.stringify({ sets: "nope" }));
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/Invalid arguments/);
    });

    it("should reject non-object set entries with a readable error", () => {
      const outcome = executeTool(controller, "play_sets", JSON.stringify({ sets: ["garbage"] }));

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toBe("Invalid arguments: each set must be an object");
      const parsed = JSON.parse(outcome.content) as { ok: boolean; error: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBe("Invalid arguments: each set must be an object");
      expect(game.getState().board).toHaveLength(0);
    });

    it("should reject non-object entries in end_turn newBoard", () => {
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, R8, R9] }] }));

      const outcome = executeTool(controller, "end_turn", JSON.stringify({ newBoard: [42] }));

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toBe("Invalid arguments: each set must be an object");
    });
  });

  describe("manipulate_board", () => {
    it("should map to controller.manipulateBoard with the new board", () => {
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7, B7, K7] },
        pool: [POOL_TILE],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, B7, K7] }] }));

      const outcome = executeTool(
        controller,
        "manipulate_board",
        JSON.stringify({ newBoard: [{ id: "s1", tiles: [K7, R7, B7] }] })
      );
      const parsed = JSON.parse(outcome.content) as { ok: boolean };

      expect(outcome.ok).toBe(true);
      expect(parsed.ok).toBe(true);
      expect(game.getState().board[0].tiles.map((t) => t.id)).toEqual(["black-7-a", "red-7-a", "blue-7-a"]);
    });

    it("should auto-generate set ids on the new board", () => {
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, R8, R9] }] }));

      executeTool(controller, "manipulate_board", JSON.stringify({ newBoard: [{ tiles: [R7, R8, R9] }] }));

      expect(game.getState().board[0].id).toMatch(/^set-\d+-0$/);
    });
  });

  describe("undo_turn", () => {
    it("should revert board changes", () => {
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, R8, R9] }] }));

      const outcome = executeTool(controller, "undo_turn", {});

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(false);
      expect(game.getState().board).toHaveLength(0);
      expect(game.getPlayerState(aiPlayerId).yourRack).toHaveLength(3);
    });
  });

  describe("draw_tile", () => {
    it("should draw and flag turn ended", () => {
      const outcome = executeTool(controller, "draw_tile", {});

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(true);
      expect(game.getPlayerState(aiPlayerId).yourRack.map((t) => t.id)).toContain("blue-2-a");
      expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    });

    it("should not flag turn ended when draw fails", () => {
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7, R8, R9] },
        pool: [],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });

      const outcome = executeTool(controller, "draw_tile", {});

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toBe("Pool is empty");
    });
  });

  describe("end_turn", () => {
    it("should end the turn without a new board", () => {
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, R8, R9] }] }));

      const outcome = executeTool(controller, "end_turn", {});

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(true);
      expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    });

    it("should forward optional newBoard to the controller", () => {
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7, B7, K7] },
        pool: [POOL_TILE],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });
      executeTool(controller, "play_sets", JSON.stringify({ sets: [{ id: "s1", tiles: [R7, B7, K7] }] }));

      const outcome = executeTool(
        controller,
        "end_turn",
        JSON.stringify({ newBoard: [{ id: "s1", tiles: [K7, B7, R7] }] })
      );

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(true);
      expect(game.getState().board[0].tiles.map((t) => t.id)).toEqual(["black-7-a", "blue-7-a", "red-7-a"]);
      expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    });

    it("should not end the turn when the controller rejects", () => {
      const outcome = executeTool(controller, "end_turn", {});

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toBe("Must play or draw before ending turn");
      expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(true);
    });
  });

  describe("pass_turn", () => {
    it("should pass and flag turn ended when pool is empty", () => {
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7] },
        pool: [],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });

      const outcome = executeTool(controller, "pass_turn", {});

      expect(outcome.ok).toBe(true);
      expect(outcome.turnEnded).toBe(true);
      expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    });

    it("should reject pass when pool is not empty", () => {
      const outcome = executeTool(controller, "pass_turn", {});

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toBe("Can only pass when pool is empty");
    });
  });

  describe("malformed input", () => {
    it("should return a readable error for malformed JSON args", () => {
      const outcome = executeTool(controller, "play_sets", "{not json");

      expect(outcome.ok).toBe(false);
      expect(outcome.turnEnded).toBe(false);
      expect(outcome.error).toMatch(/^Invalid arguments:/);
      const parsed = JSON.parse(outcome.content) as { ok: boolean; error: string };
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/^Invalid arguments:/);
    });

    it("should return a readable error for non-object args", () => {
      const outcome = executeTool(controller, "play_sets", 42);

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/^Invalid arguments:/);
    });

    it("should handle unknown tools without throwing", () => {
      const outcome = executeTool(controller, "explode_game", {});

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/Unknown tool/);
      expect(outcome.turnEnded).toBe(false);
    });
  });
});

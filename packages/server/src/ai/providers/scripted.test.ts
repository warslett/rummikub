import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../../game.js";
import { AiTurnController } from "../controller.js";
import { ScriptedProvider } from "./scripted.js";
import { getProvider } from "./index.js";

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

describe("ScriptedProvider", () => {
  let game: Game;
  let io: SocketIOServer;
  let aiPlayerId: string;
  let provider: ScriptedProvider;

  beforeEach(() => {
    io = createStubIo();
    game = new Game("TEST01");
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("test-model");
    aiPlayerId = ai.id;
    provider = new ScriptedProvider();
  });

  it("should draw a tile when no script is provided", async () => {
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
    await provider.takeTurn(controller);

    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    expect(game.getPlayerState(aiPlayerId).yourRack).toHaveLength(1);
  });

  it("should execute playSets and endTurn from script", async () => {
    game.start();
    const r7 = { id: "red-7-a", color: "red" as const, value: 7 as const };
    const r8 = { id: "red-8-a", color: "red" as const, value: 8 as const };
    const r9 = { id: "red-9-a", color: "red" as const, value: 9 as const };
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [r7, r8, r9] },
      pool: [{ id: "blue-1-a", color: "blue" as const, value: 1 as const }],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
      aiScripts: {
        [aiPlayerId]: [
          { action: "playSets", sets: [{ id: "s1", tiles: [r7, r8, r9] }] },
          { action: "endTurn" },
        ],
      },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await provider.takeTurn(controller);

    expect(game.getState().board).toHaveLength(1);
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should fallback to draw when a script action fails", async () => {
    game.start();
    const poolTile = { id: "red-5-a", color: "red" as const, value: 5 as const };
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [poolTile],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
      aiScripts: {
        [aiPlayerId]: [
          // Invalid action because AI doesn't have these tiles
          { action: "playSets", sets: [{ id: "s1", tiles: [{ id: "x", color: "red", value: 1 }] }] },
          { action: "endTurn" },
        ],
      },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await provider.takeTurn(controller);

    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
    expect(game.getPlayerState(aiPlayerId).yourRack).toHaveLength(1);
  });

  it("should pass turn when no script is provided and pool is empty", async () => {
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await provider.takeTurn(controller);

    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should pass turn when script action fails and pool is empty", async () => {
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
      aiScripts: {
        [aiPlayerId]: [
          { action: "playSets", sets: [{ id: "s1", tiles: [{ id: "x", color: "red", value: 1 }] }] },
          { action: "endTurn" },
        ],
      },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await provider.takeTurn(controller);

    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should throw error if both draw and pass fail", async () => {
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    vi.spyOn(controller, "passTurn").mockReturnValue({ ok: false, error: "Cannot pass" });

    await expect(provider.takeTurn(controller)).rejects.toThrow("Cannot pass");
  });
});

describe("providerFactory", () => {
  it("should return ScriptedProvider for 'scripted' and unknown provider names", () => {
    const scripted = getProvider("scripted");
    expect(scripted).toBeInstanceOf(ScriptedProvider);

    const unknown = getProvider("some-unknown-provider");
    expect(unknown).toBeInstanceOf(ScriptedProvider);
  });
});

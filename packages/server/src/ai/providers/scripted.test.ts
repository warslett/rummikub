import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../../game.js";
import { AiTurnController } from "../controller.js";
import { ScriptedProvider } from "./scripted.js";
import { getProvider } from "./index.js";
import { getDebugTranscript, _clearAllTranscripts } from "../debug.js";

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
    _clearAllTranscripts();
    io = createStubIo();
    game = new Game("TEST01");
    game.addPlayer("p1", "Alice");
    const ai = game.addAiPlayer("test-model");
    aiPlayerId = ai.id;
    provider = new ScriptedProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it("should throw the seeded message when a fail action is reached", async () => {
    game.start();
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [] },
      pool: [{ id: "red-5-a", color: "red" as const, value: 5 as const }],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
      aiScripts: {
        [aiPlayerId]: [{ action: "fail", message: "Seeded failure" }],
      },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await expect(provider.takeTurn(controller)).rejects.toThrow("Seeded failure");
  });

  it("should execute script actions before a fail action throws", async () => {
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
          { action: "fail", message: "Boom after playing" },
        ],
      },
    });

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await expect(provider.takeTurn(controller)).rejects.toThrow("Boom after playing");

    expect(game.getState().board).toHaveLength(1);
  });

  describe("debug transcript recording", () => {
    it("should record a prompt item and the executed tool names in order for a seeded script", async () => {
      vi.stubEnv("AI_DEBUG", "true");
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
      await provider.takeTurn(controller, { turnNumber: 3, eventsNote: "Alice drew a tile" });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.map((i) => i.type)).toEqual(["prompt", "tool_call", "tool_call"]);
      expect(transcript[0].text).toContain("Turn 3");
      expect(transcript[0].text).toContain("Alice drew a tile");
      expect(transcript.slice(1).map((i) => i.text)).toEqual(["play_sets", "end_turn"]);
    });

    it("should record draw_tile on the fallback path when no script is provided", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      game.start();
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [] },
        pool: [{ id: "red-5-a", color: "red" as const, value: 5 as const }],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });

      const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
      await provider.takeTurn(controller, { turnNumber: 1, eventsNote: "" });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.map((i) => i.type)).toEqual(["prompt", "tool_call"]);
      expect(transcript[1].text).toBe("draw_tile");
    });

    it("should record pass_turn on the fallback path when the pool is empty", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      game.start();
      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [] },
        pool: [],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });

      const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
      await provider.takeTurn(controller, { turnNumber: 1, eventsNote: "" });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.map((i) => i.type)).toEqual(["prompt", "tool_call"]);
      expect(transcript[1].text).toBe("pass_turn");
    });

    it("should not record anything when AI_DEBUG is off", async () => {
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
      await provider.takeTurn(controller, { turnNumber: 1, eventsNote: "" });

      expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
    });
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

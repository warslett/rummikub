import { describe, it, expect } from "vitest";
import type {
  Player,
  OpponentInfo,
  SpectatorGameState,
  PlayerGameState,
  GameLobbyStatePayload,
  AiModelsPayload,
  AiErrorPayload,
  AiScriptAction,
  AiDebugItem,
  AiDebugItemType,
  AiDebugEventPayload,
  AiDebugHistoryRequestPayload,
  AiDebugHistoryPayload,
} from "./index.js";

describe("Shared AI Types", () => {
  it("should allow AI properties on Player", () => {
    const player: Player = {
      id: "ai-1",
      name: "AI: test-model",
      rack: [],
      hasInitialMeld: false,
      score: 0,
      connected: true,
      gamesWon: 0,
      isAI: true,
      model: "test-model",
    };
    expect(player.isAI).toBe(true);
    expect(player.model).toBe("test-model");
  });

  it("should require isAI on OpponentInfo and allow optional model", () => {
    const opponent: OpponentInfo = {
      id: "p2",
      name: "AI: test-model",
      rackSize: 14,
      score: 0,
      gamesWon: 0,
      connected: true,
      isAI: true,
      model: "test-model",
    };
    expect(opponent.isAI).toBe(true);
    expect(opponent.model).toBe("test-model");
  });

  it("should include isAI and optional model in SpectatorGameState players", () => {
    const spectatorState: SpectatorGameState = {
      type: "spectator",
      id: "game-1",
      phase: "playing",
      board: [],
      poolSize: 80,
      currentTurnPlayerId: "p1",
      players: [
        { id: "p1", name: "Alice", score: 0, gamesWon: 0, connected: true, isAI: false },
        { id: "ai-1", name: "AI: test", score: 0, gamesWon: 0, connected: true, isAI: true, model: "test" },
      ],
      roundNumber: 1,
      consecutivePasses: 0,
      aiDebug: false,
    };
    expect(spectatorState.players[1].isAI).toBe(true);
    expect(spectatorState.players[1].model).toBe("test");
  });

  it("should include isAI and optional model in GameLobbyStatePayload players", () => {
    const lobby: GameLobbyStatePayload = {
      players: [
        { id: "p1", name: "Alice", isAI: false },
        { id: "ai-1", name: "AI: test", isAI: true, model: "test" },
      ],
    };
    expect(lobby.players[1].isAI).toBe(true);
    expect(lobby.players[1].model).toBe("test");
  });

  it("should typecheck AiModelsPayload and AiErrorPayload", () => {
    const models: AiModelsPayload = {
      models: ["model-a", "model-b"],
      defaultModel: "model-a",
    };
    const error: AiErrorPayload = {
      playerId: "ai-1",
      playerName: "AI: model-a",
      message: "Gateway timeout",
    };
    expect(models.models).toHaveLength(2);
    expect(error.playerId).toBe("ai-1");
  });

  it("should typecheck AiScriptAction variants", () => {
    const actions: AiScriptAction[] = [
      { action: "playSets", sets: [] },
      { action: "manipulateBoard", newBoard: [] },
      { action: "drawTile" },
      { action: "undoTurn" },
      { action: "endTurn" },
      { action: "endTurn", newBoard: [] },
      { action: "passTurn" },
      { action: "fail", message: "Seeded failure" },
    ];
    expect(actions).toHaveLength(8);
  });
});

describe("Shared AI Debug Types", () => {
  it("should typecheck all four AiDebugItemType variants", () => {
    const types: AiDebugItemType[] = ["prompt", "thinking", "tool_call", "response"];
    expect(types).toHaveLength(4);
  });

  it("should typecheck AiDebugItem with readable text and a timestamp", () => {
    const item: AiDebugItem = {
      type: "prompt",
      text: "Turn 1 has started. Call get_game_state to see the current board.",
      ts: "2026-01-01T00:00:00.000Z",
    };
    expect(item.type).toBe("prompt");
    expect(item.text).toEqual(expect.any(String));
    expect(item.ts).toEqual(expect.any(String));
  });

  it("should typecheck AiDebugEventPayload with playerId, roundNumber, item and rack", () => {
    const tile = { id: "red-7-a", color: "red" as const, value: 7 as const };
    const payload: AiDebugEventPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      item: { type: "tool_call", text: "draw_tile", ts: "2026-01-01T00:00:00.000Z" },
      rack: [tile],
    };
    expect(payload.playerId).toBe("ai-1");
    expect(payload.roundNumber).toBe(1);
    expect(payload.item.type).toBe("tool_call");
    expect(payload.rack).toHaveLength(1);
  });

  it("should typecheck AiDebugHistoryRequestPayload", () => {
    const payload: AiDebugHistoryRequestPayload = { playerId: "ai-1" };
    expect(payload.playerId).toBe("ai-1");
  });

  it("should typecheck AiDebugHistoryPayload with items and rack", () => {
    const payload: AiDebugHistoryPayload = {
      playerId: "ai-1",
      roundNumber: 2,
      items: [
        { type: "prompt", text: "Turn 1 has started.", ts: "2026-01-01T00:00:00.000Z" },
        { type: "tool_call", text: "end_turn", ts: "2026-01-01T00:00:01.000Z" },
      ],
      rack: [],
    };
    expect(payload.items).toHaveLength(2);
    expect(payload.roundNumber).toBe(2);
    expect(payload.rack).toEqual([]);
  });

  it("should include the aiDebug flag on PlayerGameState", () => {
    const state: PlayerGameState = {
      type: "player",
      id: "game-1",
      phase: "playing",
      yourRack: [],
      yourName: "Alice",
      board: [],
      poolSize: 80,
      currentTurnPlayerId: "p1",
      isYourTurn: true,
      yourScore: 0,
      hasInitialMeld: false,
      hasPlayedThisTurn: false,
      roundNumber: 1,
      yourGamesWon: 0,
      consecutivePasses: 0,
      aiDebug: true,
      opponents: [],
    };
    expect(state.aiDebug).toBe(true);
  });

  it("should include the aiDebug flag on SpectatorGameState", () => {
    const state: SpectatorGameState = {
      type: "spectator",
      id: "game-1",
      phase: "playing",
      board: [],
      poolSize: 80,
      currentTurnPlayerId: "p1",
      players: [],
      roundNumber: 1,
      consecutivePasses: 0,
      aiDebug: false,
    };
    expect(state.aiDebug).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import type {
  Player,
  OpponentInfo,
  SpectatorGameState,
  GameLobbyStatePayload,
  AiModelsPayload,
  AiErrorPayload,
  AiScriptAction,
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
    ];
    expect(actions).toHaveLength(7);
  });
});

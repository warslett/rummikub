import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Server as SocketIOServer } from "socket.io";
import { registerHandlers, manager } from "./handlers.js";
import * as runnerModule from "./ai/runner.js";
import * as llmModule from "./ai/providers/llm.js";
import * as debugModule from "./ai/debug.js";
import { _clearAllTranscripts } from "./ai/debug.js";
import type { GameLobbyStatePayload, AiModelsPayload, AiDebugHistoryPayload } from "@rummikub/shared";

interface MockSocket {
  id: string;
  data: Record<string, unknown>;
  callbacks: Record<string, (data?: unknown) => void | Promise<void>>;
  emitted: { event: string; data: unknown }[];
  on(event: string, cb: (data?: unknown) => void | Promise<void>): void;
  emit(event: string, data: unknown): void;
  join(room: string): void;
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function createMockSocket(id = "s1"): MockSocket {
  const callbacks: Record<string, (data?: unknown) => void | Promise<void>> = {};
  const emitted: { event: string; data: unknown }[] = [];
  return {
    id,
    data: {},
    callbacks,
    emitted,
    on(event: string, cb: (data?: unknown) => void | Promise<void>) {
      callbacks[event] = cb;
    },
    emit(event: string, data: unknown) {
      emitted.push({ event, data });
    },
    join: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };
}

function createMockIo() {
  let connectionCallback: ((socket: MockSocket) => void) | null = null;
  const emittedRoom: { room: string; event: string; data: unknown }[] = [];
  const socketsMap = new Map<string, MockSocket>();
  const roomsMap = new Map<string, Set<string>>();

  const io = {
    on(event: string, cb: (socket: MockSocket) => void) {
      if (event === "connection") {
        connectionCallback = cb;
      }
    },
    to(room: string) {
      return {
        emit(event: string, data: unknown) {
          emittedRoom.push({ room, event, data });
        },
      };
    },
    sockets: {
      adapter: {
        rooms: roomsMap,
      },
      sockets: socketsMap,
    },
    _connect(socket: MockSocket) {
      socketsMap.set(socket.id, socket);
      connectionCallback?.(socket);
    },
    _emittedRoom: emittedRoom,
  };

  return io as unknown as SocketIOServer & {
    _connect: (s: MockSocket) => void;
    _emittedRoom: { room: string; event: string; data: unknown }[];
  };
}

describe("Socket Handlers AI Integration", () => {
  let io: ReturnType<typeof createMockIo>;
  let socket: MockSocket;

  beforeEach(() => {
    vi.restoreAllMocks();
    _clearAllTranscripts();
    io = createMockIo();
    registerHandlers(io as unknown as SocketIOServer);
    socket = createMockSocket("sock-1");
    io._connect(socket);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should handle ai:add and broadcast lobbyState with AI player", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    const createEvt = socket.emitted.find((e) => e.event === "game:created");
    const gameCode = (createEvt?.data as { gameCode: string }).gameCode;

    socket.callbacks["ai:add"]({ model: "gpt-4" });

    const lobbyEvts = io._emittedRoom.filter(
      (e) => e.room === gameCode && e.event === "game:lobbyState"
    );
    const lastLobby = lobbyEvts[lobbyEvts.length - 1]?.data as GameLobbyStatePayload;
    expect(lastLobby.players).toHaveLength(2);
    expect(lastLobby.players[1].isAI).toBe(true);
    expect(lastLobby.players[1].name).toBe("AI: gpt-4");
  });

  it("should handle ai:add with a custom name and broadcast lobbyState", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    const createEvt = socket.emitted.find((e) => e.event === "game:created");
    const gameCode = (createEvt?.data as { gameCode: string }).gameCode;

    socket.callbacks["ai:add"]({ model: "gpt-4", name: "My Bot" });

    const lobbyEvts = io._emittedRoom.filter(
      (e) => e.room === gameCode && e.event === "game:lobbyState"
    );
    const lastLobby = lobbyEvts[lobbyEvts.length - 1]?.data as GameLobbyStatePayload;
    expect(lastLobby.players[1].name).toBe("My Bot");
  });

  it("should reject ai:add if lobby is full", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    socket.callbacks["ai:add"]({ model: "m1" });
    socket.callbacks["ai:add"]({ model: "m2" });
    socket.callbacks["ai:add"]({ model: "m3" });
    socket.callbacks["ai:add"]({ model: "m4" }); // 5th player

    const rejectEvt = socket.emitted.find(
      (e) => e.event === "move:rejected" && (e.data as { reason: string }).reason.includes("full")
    );
    expect(rejectEvt).toBeDefined();
  });

  it("should handle ai:remove and broadcast updated lobbyState", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    const createEvt = socket.emitted.find((e) => e.event === "game:created");
    const gameCode = (createEvt?.data as { gameCode: string }).gameCode;

    socket.callbacks["ai:add"]({ model: "gpt-4" });
    const game = manager.getGame(gameCode)!;
    const aiPlayer = game.getState().players.find((p) => p.isAI)!;

    socket.callbacks["ai:remove"]({ playerId: aiPlayer.id });

    const lobbyEvts = io._emittedRoom.filter(
      (e) => e.room === gameCode && e.event === "game:lobbyState"
    );
    const lastLobby = lobbyEvts[lobbyEvts.length - 1]?.data as GameLobbyStatePayload;
    expect(lastLobby.players).toHaveLength(1);
    expect(lastLobby.players.some((p) => p.id === aiPlayer.id)).toBe(false);
  });

  it("should handle ai:getModels and emit ai:models to requesting socket", async () => {
    await socket.callbacks["ai:getModels"]();

    const modelsEvt = socket.emitted.find((e) => e.event === "ai:models");
    expect(modelsEvt).toBeDefined();
    const data = modelsEvt?.data as AiModelsPayload;
    expect(data.models).toBeDefined();
    expect(data.defaultModel).toBeDefined();
  });

  it("should call maybeRunNextTurn on game:start", () => {
    const runnerSpy = vi.spyOn(runnerModule, "maybeRunNextTurn").mockResolvedValue();
    socket.callbacks["game:create"]({ playerName: "Alice" });
    const createEvt = socket.emitted.find((e) => e.event === "game:created");
    const gameCode = (createEvt?.data as { gameCode: string }).gameCode;

    socket.callbacks["ai:add"]({ model: "test-model" });
    socket.callbacks["game:start"]({ gameCode });

    expect(runnerSpy).toHaveBeenCalled();
  });

  it("should reject ai:add if model is missing or invalid", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    socket.callbacks["ai:add"](undefined as unknown as { model: string });

    const rejectEvt = socket.emitted.find(
      (e) => e.event === "move:rejected" && (e.data as { reason: string }).reason.includes("Model is required")
    );
    expect(rejectEvt).toBeDefined();

    socket.callbacks["ai:add"]({ model: "   " });
    const rejectEvt2 = socket.emitted.filter(
      (e) => e.event === "move:rejected" && (e.data as { reason: string }).reason.includes("Model is required")
    );
    expect(rejectEvt2).toHaveLength(2);
  });

  it("should reject ai:remove if playerId is missing or invalid", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    socket.callbacks["ai:remove"](undefined as unknown as { playerId: string });

    const rejectEvt = socket.emitted.find(
      (e) => e.event === "move:rejected" && (e.data as { reason: string }).reason.includes("Player ID is required")
    );
    expect(rejectEvt).toBeDefined();

    socket.callbacks["ai:remove"]({ playerId: "   " });
    const rejectEvt2 = socket.emitted.filter(
      (e) => e.event === "move:rejected" && (e.data as { reason: string }).reason.includes("Player ID is required")
    );
    expect(rejectEvt2).toHaveLength(2);
  });

  it("should ignore ai:add and ai:remove from spectator", () => {
    socket.callbacks["game:create"]({ playerName: "Alice" });
    socket.data.isSpectator = true;

    socket.callbacks["ai:add"]({ model: "gpt-4" });
    socket.callbacks["ai:remove"]({ playerId: "some-id" });

    const rejectEvt = socket.emitted.find((e) => e.event === "move:rejected");
    expect(rejectEvt).toBeUndefined();
  });

  it("should reset AI conversations and turn context on game:playAgain", () => {
    const runnerSpy = vi.spyOn(runnerModule, "maybeRunNextTurn").mockResolvedValue();
    const resetConversationsSpy = vi.spyOn(llmModule, "resetConversations").mockImplementation(() => {});
    const resetTurnContextSpy = vi.spyOn(runnerModule, "resetTurnContext").mockImplementation(() => {});
    const resetAiErrorsSpy = vi.spyOn(runnerModule, "resetAiErrors").mockImplementation(() => {});
    const resetTranscriptsSpy = vi.spyOn(debugModule, "resetTranscripts").mockImplementation(() => {});

    socket.callbacks["game:create"]({ playerName: "Alice" });
    const createEvt = socket.emitted.find((e) => e.event === "game:created");
    const gameCode = (createEvt?.data as { gameCode: string }).gameCode;
    const game = manager.getGame(gameCode)!;
    game.addAiPlayer("test-model");
    game.start();
    game.getState().phase = "ended";

    socket.callbacks["game:playAgain"]();

    expect(game.getState().roundNumber).toBe(2);
    expect(resetConversationsSpy).toHaveBeenCalledWith(gameCode, 2);
    expect(resetTranscriptsSpy).toHaveBeenCalledWith(gameCode, 2);
    expect(resetTurnContextSpy).toHaveBeenCalledWith(gameCode);
    expect(resetAiErrorsSpy).toHaveBeenCalledWith(gameCode);
    expect(runnerSpy).toHaveBeenCalled();
  });

  describe("ai:debugHistory", () => {
    function setupAiGameWithTurn() {
      vi.stubEnv("AI_DEBUG", "true");
      socket.callbacks["game:create"]({ playerName: "Alice" });
      const createEvt = socket.emitted.find((e) => e.event === "game:created");
      const gameCode = (createEvt?.data as { gameCode: string }).gameCode;
      const game = manager.getGame(gameCode)!;
      socket.callbacks["ai:add"]({ model: "test-model" });
      const aiPlayerId = game.getState().players.find((p) => p.isAI)!.id;
      socket.callbacks["game:start"]({ gameCode });

      socket.callbacks["game:seed"]({
        gameCode,
        state: {
          board: [],
          racks: {},
          pool: [{ id: "red-5-a", color: "red", value: 5 }],
          currentTurnPlayerId: aiPlayerId,
          hasInitialMeld: {},
        },
      });
      return { gameCode, aiPlayerId };
    }

    it("should return recorded items and the AI rack to the requesting socket only", () => {
      const { gameCode, aiPlayerId } = setupAiGameWithTurn();
      const game = manager.getGame(gameCode)!;
      const aiPlayer = game.getState().players.find((p) => p.id === aiPlayerId)!;

      socket.callbacks["ai:debugHistory"]({ playerId: aiPlayerId });

      const historyEvt = socket.emitted.find((e) => e.event === "ai:debugHistory");
      expect(historyEvt).toBeDefined();
      const payload = historyEvt?.data as AiDebugHistoryPayload;
      expect(payload.playerId).toBe(aiPlayerId);
      expect(payload.roundNumber).toBe(1);
      expect(payload.items.map((i) => i.type)).toEqual(["prompt", "tool_call"]);
      expect(payload.items[1].text).toBe("draw_tile");
      expect(payload.rack).toEqual(aiPlayer.rack);
      expect(
        io._emittedRoom.filter((e) => e.event === "ai:debugHistory")
      ).toHaveLength(0);
    });

    it("should return empty items for an unknown player", () => {
      setupAiGameWithTurn();

      socket.callbacks["ai:debugHistory"]({ playerId: "no-such-player" });

      const historyEvt = socket.emitted.find((e) => e.event === "ai:debugHistory");
      expect(historyEvt).toBeDefined();
      const payload = historyEvt?.data as AiDebugHistoryPayload;
      expect(payload.items).toEqual([]);
      expect(payload.rack).toEqual([]);
    });

    it("should return empty items for a non-AI player", () => {
      setupAiGameWithTurn();

      socket.callbacks["ai:debugHistory"]({ playerId: socket.data.playerId as string });

      const historyEvt = socket.emitted.find((e) => e.event === "ai:debugHistory");
      expect(historyEvt).toBeDefined();
      const payload = historyEvt?.data as AiDebugHistoryPayload;
      expect(payload.items).toEqual([]);
      expect(payload.rack).toEqual([]);
    });

    it("should return empty items when AI_DEBUG is off", () => {
      const { aiPlayerId } = setupAiGameWithTurn();
      vi.stubEnv("AI_DEBUG", "false");

      socket.callbacks["ai:debugHistory"]({ playerId: aiPlayerId });

      const historyEvt = socket.emitted.filter((e) => e.event === "ai:debugHistory");
      expect(historyEvt).toHaveLength(1);
      const payload = historyEvt[0].data as AiDebugHistoryPayload;
      expect(payload.items).toEqual([]);
      expect(payload.rack).toEqual([]);
    });
  });
});

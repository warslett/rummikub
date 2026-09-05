import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import type OpenAI from "openai";
import { Game } from "../../game.js";
import { AiTurnController } from "../controller.js";
import { LlmProvider, resetConversations, purgeGame, _clearAllConversations } from "./llm.js";
import { toolSchemas } from "../tools.js";
import { aiConfig } from "../config.js";

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

interface RecordedCall {
  model: string;
  tools: unknown;
  messages: { role: string; content: unknown }[];
}

interface StubClient {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
  responses: (Error | Record<string, unknown>)[];
  calls: RecordedCall[];
}

function createStubClient(): StubClient {
  const responses: (Error | Record<string, unknown>)[] = [];
  const calls: RecordedCall[] = [];
  const create = vi.fn(
    async (args: { model: string; messages: { role: string; content: unknown }[]; tools: unknown }) => {
      calls.push({
        model: args.model,
        tools: args.tools,
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const next = responses.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }
  );
  return {
    chat: { completions: { create } },
    responses,
    calls,
  };
}

function toolCallMessage(calls: { id: string; name: string; arguments: string }[], content: string | null = null) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.arguments },
          })),
        },
      },
    ],
  };
}

function plainMessage(content: string) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

const R7 = { id: "red-7-a", color: "red" as const, value: 7 as const };
const R8 = { id: "red-8-a", color: "red" as const, value: 8 as const };
const R9 = { id: "red-9-a", color: "red" as const, value: 9 as const };
const POOL_TILE = { id: "blue-2-a", color: "blue" as const, value: 2 as const };

describe("LlmProvider", () => {
  let game: Game;
  let io: SocketIOServer;
  let aiPlayerId: string;
  let client: StubClient;
  let provider: LlmProvider;

  beforeEach(() => {
    _clearAllConversations();
    vi.stubEnv("AI_API_KEY", "test-key");
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
    client = createStubClient();
    provider = new LlmProvider(client as unknown as OpenAI);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should send system prompt and turn-start message with the player's model and tools on first turn", async () => {
    client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    expect(client.calls).toHaveLength(1);
    const call = client.calls[0];
    expect(call.model).toBe("test-model");
    expect(call.tools).toEqual(toolSchemas);
    expect(call.messages).toHaveLength(2);
    expect(call.messages[0].role).toBe("system");
    expect(String(call.messages[0].content)).toContain("Sabra");
    expect(String(call.messages[0].content)).toContain("AI: test-model");
    expect(call.messages[1].role).toBe("user");
    expect(String(call.messages[1].content)).toContain("Turn 1");
    expect(String(call.messages[1].content)).toContain("get_game_state");
  });

  it("should fall back to aiConfig.defaultModel when the player has no model", async () => {
    game.getState().players.find((p) => p.id === aiPlayerId)!.model = undefined;
    client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    expect(client.calls[0].model).toBe(aiConfig.defaultModel);
  });

  it("should feed tool results back and let the model retry after a rejection", async () => {
    client.responses.push(
      toolCallMessage([
        {
          id: "call-1",
          name: "play_sets",
          arguments: JSON.stringify({ sets: [{ id: "s1", tiles: [{ id: "nope", color: "red", value: 1 }] }] }),
        },
      ]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    expect(client.calls).toHaveLength(2);
    const toolMessages = client.calls[1].messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(1);
    expect(String(toolMessages[0].content)).toContain("Tile not in player's rack");
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should stop looping once a turn-ending tool succeeds", async () => {
    client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    expect(client.calls).toHaveLength(1);
    expect(game.getPlayerState(aiPlayerId).yourRack.map((t) => t.id)).toContain("blue-2-a");
  });

  it("should pad remaining tool calls after a turn-ending tool succeeds", async () => {
    client.responses.push(
      toolCallMessage([
        { id: "call-1", name: "draw_tile", arguments: "{}" },
        { id: "call-2", name: "get_game_state", arguments: "{}" },
      ]),
      toolCallMessage([{ id: "call-3", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });
    expect(client.calls).toHaveLength(1);

    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 2,
      eventsNote: "",
    });

    const toolMessages = client.calls[1].messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    expect(String(toolMessages[1].content)).toContain("Turn has already ended");
  });

  it("should not end the turn when end_turn is rejected", async () => {
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "end_turn", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    expect(client.calls).toHaveLength(2);
    const toolMessages = client.calls[1].messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(1);
    expect(String(toolMessages[0].content)).toContain("Must play or draw before ending turn");
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should handle unknown tool names with an error tool result", async () => {
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "explode_game", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });

    const toolMessages = client.calls[1].messages.filter((m) => m.role === "tool");
    expect(String(toolMessages[0].content)).toContain("Unknown tool: explode_game");
  });

  it("should send a corrective message once for plain-text replies, then fail", async () => {
    client.responses.push(plainMessage("Let me think about it..."), plainMessage("Still thinking..."));

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/no tool call/i);

    expect(client.calls).toHaveLength(2);
    const messages = client.calls[1].messages;
    const assistant = messages[messages.length - 2];
    const corrective = messages[messages.length - 1];
    expect(assistant.role).toBe("assistant");
    expect(String(assistant.content)).toBe("Let me think about it...");
    expect(corrective.role).toBe("user");
    expect(String(corrective.content)).toMatch(/Call a tool/i);
  });

  it("should throw after exceeding the 50-iteration cap", async () => {
    client.responses.push(
      ...Array.from({ length: 50 }, () => toolCallMessage([{ id: "call-1", name: "get_game_state", arguments: "{}" }]))
    );

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/50/);

    expect(client.calls).toHaveLength(50);
  });

  it("should persist the conversation across turns and reset it on resetConversations", async () => {
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }]),
      toolCallMessage([{ id: "call-3", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });
    const firstCount = client.calls[0].messages.length;

    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 2, eventsNote: "" });
    expect(client.calls[1].messages.length).toBeGreaterThan(firstCount);
    const lastTurn2 = client.calls[1].messages[client.calls[1].messages.length - 1];
    expect(lastTurn2.role).toBe("user");
    expect(String(lastTurn2.content)).toContain("Turn 2");

    resetConversations("TEST01", 2);
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });
    expect(client.calls[2].messages).toHaveLength(2);
    expect(client.calls[2].messages[0].role).toBe("system");
  });

  it("should keep conversations independent per player", async () => {
    const twoAiGame = new Game("TEST02");
    twoAiGame.addPlayer("p1", "Alice");
    const ai1 = twoAiGame.addAiPlayer("test-model");
    const ai2 = twoAiGame.addAiPlayer("second-model");
    twoAiGame.start();
    twoAiGame.seedGame({
      board: [],
      racks: { p1: [R9], [ai1.id]: [R7], [ai2.id]: [R8] },
      pool: [POOL_TILE, { id: "orange-3-a", color: "orange" as const, value: 3 as const }],
      currentTurnPlayerId: ai1.id,
      hasInitialMeld: { p1: true, [ai1.id]: true, [ai2.id]: true },
    });

    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, twoAiGame, "TEST02", ai1.id), { turnNumber: 1, eventsNote: "" });
    await provider.takeTurn(new AiTurnController(io, twoAiGame, "TEST02", ai2.id), { turnNumber: 2, eventsNote: "" });

    expect(client.calls[0].model).toBe("test-model");
    expect(client.calls[1].model).toBe("second-model");
    expect(client.calls[1].messages).toHaveLength(2);
  });

  it("should propagate SDK errors to the runner", async () => {
    client.responses.push(new Error("Rate limited"));

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow("Rate limited");
  });

  it("should fail fast with a clear error when AI_API_KEY is missing", async () => {
    vi.stubEnv("AI_API_KEY", "");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const keylessProvider = new LlmProvider();

    await expect(
      keylessProvider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/AI_API_KEY/);

    const errorLine = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string)).find((l) => l.event === "error");
    expect(errorLine).toBeDefined();
    expect(errorLine.data.message).toMatch(/AI_API_KEY/);
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it("should log the full turn as JSON lines with correlation fields", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    client.responses.push(
      toolCallMessage([
        {
          id: "call-1",
          name: "play_sets",
          arguments: JSON.stringify({ sets: [{ id: "s1", tiles: [{ id: "nope", color: "red", value: 1 }] }] }),
        },
      ]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
    );

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });

    const lines = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    const events = lines.map((l) => l.event as string);
    expect(events).toEqual([
      "system_prompt",
      "request",
      "response",
      "tool_call",
      "tool_result",
      "request",
      "response",
      "tool_call",
      "tool_result",
      "turn_complete",
    ]);
    for (const line of lines) {
      expect(line.gameCode).toBe("TEST01");
      expect(line.playerId).toBe(aiPlayerId);
      expect(line.model).toBe("test-model");
      expect(line.ts).toEqual(expect.any(String));
    }
    const toolResult = lines.find((l) => l.event === "tool_result") as {
      data: { ok: boolean; error: string; result: { ok: boolean; error: string } };
    };
    expect(toolResult.data.ok).toBe(false);
    expect(toolResult.data.error).toBe("Tile not in player's rack");
    expect(toolResult.data.result).toEqual({ ok: false, error: "Tile not in player's rack" });
    const turnComplete = lines.find((l) => l.event === "turn_complete") as { data: { iterations: number } };
    expect(turnComplete.data.iterations).toBe(2);
  });

  it("should log the state payload of successful tool results", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

    await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });

    const lines = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    const toolResult = lines.find((l) => l.event === "tool_result") as {
      data: { name: string; ok: boolean; result: { ok: boolean; state: { poolSize: number; rack: { id: string }[] } } };
    };
    expect(toolResult.data.name).toBe("draw_tile");
    expect(toolResult.data.ok).toBe(true);
    expect(toolResult.data.result.ok).toBe(true);
    expect(toolResult.data.result.state.poolSize).toBe(0);
    expect(toolResult.data.result.state.rack.map((t) => t.id)).toContain("blue-2-a");
  });

  describe("purgeGame", () => {
    it("should remove all conversations for the game", async () => {
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));
      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });

      purgeGame("TEST01");

      game.seedGame({
        board: [],
        racks: { p1: [], [aiPlayerId]: [R7, R8, R9] },
        pool: [POOL_TILE],
        currentTurnPlayerId: aiPlayerId,
        hasInitialMeld: { p1: true, [aiPlayerId]: true },
      });
      client.responses.push(toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }]));
      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });
      expect(client.calls[1].messages).toHaveLength(2);
      expect(client.calls[1].messages[0].role).toBe("system");
    });

    it("should keep conversations of other games", async () => {
      const otherGame = new Game("OTHER1");
      otherGame.addPlayer("p1", "Alice");
      const otherAi = otherGame.addAiPlayer("test-model");
      otherGame.start();
      otherGame.seedGame({
        board: [],
        racks: { p1: [], [otherAi.id]: [R7, R8, R9] },
        pool: [POOL_TILE],
        currentTurnPlayerId: otherAi.id,
        hasInitialMeld: { p1: true, [otherAi.id]: true },
      });

      client.responses.push(
        toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
        toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
      );
      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" });
      await provider.takeTurn(new AiTurnController(io, otherGame, "OTHER1", otherAi.id), { turnNumber: 1, eventsNote: "" });

      purgeGame("TEST01");

      otherGame.seedGame({
        board: [],
        racks: { p1: [], [otherAi.id]: [R7, R8, R9] },
        pool: [POOL_TILE],
        currentTurnPlayerId: otherAi.id,
        hasInitialMeld: { p1: true, [otherAi.id]: true },
      });
      client.responses.push(toolCallMessage([{ id: "call-3", name: "draw_tile", arguments: "{}" }]));
      await provider.takeTurn(new AiTurnController(io, otherGame, "OTHER1", otherAi.id), { turnNumber: 2, eventsNote: "" });
      expect(client.calls[2].messages.length).toBeGreaterThan(2);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { RateLimitError, InternalServerError } from "openai";
import { Game } from "../../game.js";
import { AiTurnController } from "../controller.js";
import {
  LlmProvider,
  resetConversations,
  purgeGame,
  restoreConversations,
  unloadConversations,
  _clearAllConversations,
} from "./llm.js";
import { getDebugTranscript, _clearAllTranscripts } from "../debug.js";
import { toolSchemas } from "../tools.js";
import { aiConfig } from "../config.js";
import {
  setAiStore,
  flushAiWrites,
  _clearAiWriteQueues,
  NoopAiStore,
  getAiStore,
} from "../../storage/aiStore.js";
import type { AiConversationRecord } from "../../storage/aiStore.js";
import type { AiDebugEventPayload } from "@rummikub/shared";

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
  max_tokens?: number;
  headers?: Record<string, string>;
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
    async (
      args: {
        model: string;
        messages: { role: string; content: unknown }[];
        tools: unknown;
        max_tokens?: number;
      },
      options?: { headers?: Record<string, string> }
    ) => {
      calls.push({
        model: args.model,
        tools: args.tools,
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: args.max_tokens,
        headers: options?.headers,
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

class FakeAiStore extends NoopAiStore {
  saved: AiConversationRecord[] = [];
  seeded: AiConversationRecord[] = [];

  override async upsertConversation(key: string, messages: ChatCompletionMessageParam[]): Promise<void> {
    this.saved.push({ key, messages: JSON.parse(JSON.stringify(messages)) as ChatCompletionMessageParam[] });
  }

  override async loadAllConversations(): Promise<AiConversationRecord[]> {
    return this.seeded.map((record) => ({
      key: record.key,
      messages: JSON.parse(JSON.stringify(record.messages)) as ChatCompletionMessageParam[],
    }));
  }
}

describe("LlmProvider", () => {
  let game: Game;
  let io: SocketIOServer;
  let aiPlayerId: string;
  let client: StubClient;
  let provider: LlmProvider;

  beforeEach(() => {
    _clearAllConversations();
    _clearAllTranscripts();
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
    vi.useRealTimers();
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

  it("should throw after exceeding the iteration cap with reason iteration_cap", async () => {
    client.responses.push(
      ...Array.from({ length: 25 }, () => toolCallMessage([{ id: "call-1", name: "get_game_state", arguments: "{}" }]))
    );

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/25/);

    expect(client.calls).toHaveLength(25);
  });

  it("should retry transient errors with backoff and complete the turn", async () => {
    vi.useFakeTimers();
    client.responses.push(
      new RateLimitError(429, {}, "slow down", new Headers()),
      toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }])
    );

    const promise = provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(client.calls).toHaveLength(2);
    expect(game.getPlayerState(aiPlayerId).isYourTurn).toBe(false);
  });

  it("should pause after exhausting all retries", async () => {
    vi.useFakeTimers();
    const lastError = new InternalServerError(500, {}, "boom", new Headers());
    client.responses.push(
      new InternalServerError(500, {}, "boom", new Headers()),
      new InternalServerError(500, {}, "boom", new Headers()),
      new InternalServerError(500, {}, "boom", new Headers()),
      lastError
    );

    const promise = provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });
    const assertion = expect(promise).rejects.toBe(lastError);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(client.calls).toHaveLength(4);
  });

  it("should not retry fatal auth errors", async () => {
    vi.useFakeTimers();
    const authError = new Error("401 Invalid API key");
    client.responses.push(authError);

    const promise = provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
      turnNumber: 1,
      eventsNote: "",
    });
    const assertion = expect(promise).rejects.toThrow("401 Invalid API key");
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;

    expect(client.calls).toHaveLength(1);
  });

  it("should throw with reason malformed after two all-malformed completions", async () => {
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "explode_game", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "explode_game", arguments: "{}" }])
    );

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/malformed/i);

    expect(client.calls).toHaveLength(2);
  });

  it("should reset the malformed streak on a successful completion", async () => {
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "explode_game", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "get_game_state", arguments: "{}" }]),
      toolCallMessage([{ id: "call-3", name: "explode_game", arguments: "{}" }]),
      toolCallMessage([{ id: "call-4", name: "explode_game", arguments: "{}" }])
    );

    await expect(
      provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/malformed/i);

    expect(client.calls).toHaveLength(4);
  });

  it("should compact the conversation before the turn when over the token limit", async () => {
    vi.stubEnv("AI_CONTEXT_TOKEN_LIMIT", "50");
    vi.stubEnv("AI_COMPACT_KEEP_TURNS", "1");
    client.responses.push(
      toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
      toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }]),
      { choices: [{ message: { role: "assistant", content: "The player drew tiles." } }] },
      toolCallMessage([{ id: "call-3", name: "draw_tile", arguments: "{}" }])
    );

    const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
    await provider.takeTurn(controller, { turnNumber: 1, eventsNote: "" });
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    await provider.takeTurn(controller, { turnNumber: 2, eventsNote: "" });
    game.seedGame({
      board: [],
      racks: { p1: [], [aiPlayerId]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: aiPlayerId,
      hasInitialMeld: { p1: true, [aiPlayerId]: true },
    });
    await provider.takeTurn(controller, { turnNumber: 3, eventsNote: "" });

    expect(client.calls[2].tools).toEqual([]);
    expect(client.calls[2].max_tokens).toBe(2000);
    const turn3Messages = client.calls[3].messages;
    const summaryMsg = turn3Messages.find((m) => String(m.content).includes("[Summary of earlier conversation]"));
    expect(summaryMsg).toBeDefined();
    expect(String(turn3Messages[turn3Messages.length - 1].content)).toContain("Turn 3");
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
    const keylessProvider = new LlmProvider();

    await expect(
      keylessProvider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
    ).rejects.toThrow(/AI_API_KEY/);

    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  describe("AI debug transcript recording", () => {
    it("should record prompt, thinking, response and tool-call items in order with readable text", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push({
        choices: [
          {
            message: {
              role: "assistant",
              content: "I will draw a tile.",
              reasoning_content: "The rack has 7, 8, 9 red; drawing is safe.",
              tool_calls: [{ id: "call-1", type: "function", function: { name: "draw_tile", arguments: "{}" } }],
            },
          },
        ],
      });

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.map((i) => i.type)).toEqual([
        "prompt",
        "prompt",
        "thinking",
        "response",
        "tool_call",
      ]);
      expect(transcript[0].text).toContain("Sabra");
      expect(transcript[0].text).toContain("AI: test-model");
      expect(transcript[1].text).toContain("Turn 1");
      expect(transcript[2].text).toContain("drawing is safe");
      expect(transcript[3].text).toBe("I will draw a tile.");
      expect(transcript[4].text).toBe("draw_tile");
      for (const item of transcript) {
        expect(item.ts).toEqual(expect.any(String));
        expect(isNaN(Date.parse(item.ts))).toBe(false);
      }
    });

    it("should broadcast each recorded item as an ai:debug event with the post-tool rack", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));
      const emit = (io.to("TEST01") as unknown as { emit: ReturnType<typeof vi.fn> }).emit;

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const debugEvents = emit.mock.calls.filter((c) => c[0] === "ai:debug");
      expect(debugEvents).toHaveLength(3);
      const lastPayload = debugEvents[debugEvents.length - 1][1] as AiDebugEventPayload;
      expect(lastPayload.playerId).toBe(aiPlayerId);
      expect(lastPayload.roundNumber).toBe(1);
      expect(lastPayload.item.type).toBe("tool_call");
      expect(lastPayload.rack.map((t) => t.id)).toContain("blue-2-a");
    });

    it("should not record or broadcast anything when AI_DEBUG is off", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const emit = (io.to("TEST01") as unknown as { emit: ReturnType<typeof vi.fn> }).emit;
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
      expect(emit.mock.calls.filter((c) => c[0] === "ai:debug")).toHaveLength(0);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("should record structured reasoning content blocks as readable text", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push({
        choices: [
          {
            message: {
              role: "assistant",
              content: "I will draw a tile.",
              reasoning_content: [
                { type: "text", text: "The rack has 7, 8, 9 red." },
                { type: "text", text: "Drawing is safe." },
              ],
              tool_calls: [{ id: "call-1", type: "function", function: { name: "draw_tile", arguments: "{}" } }],
            },
          },
        ],
      });

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const thinking = getDebugTranscript(game, aiPlayerId).filter((i) => i.type === "thinking");
      expect(thinking).toHaveLength(1);
      expect(thinking[0].text).toContain("The rack has 7, 8, 9 red.");
      expect(thinking[0].text).toContain("Drawing is safe.");
      expect(thinking[0].text).not.toContain("[object Object]");
    });

    it("should not record a thinking item when reasoning content normalizes to empty text", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push({
        choices: [
          {
            message: {
              role: "assistant",
              content: "I will draw a tile.",
              reasoning_content: [],
              tool_calls: [{ id: "call-1", type: "function", function: { name: "draw_tile", arguments: "{}" } }],
            },
          },
        ],
      });

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.filter((i) => i.type === "thinking")).toHaveLength(0);
      expect(transcript.filter((i) => i.type === "tool_call").map((i) => i.text)).toEqual(["draw_tile"]);
    });

    it("should record a tool call but no response item when the completion has null content", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }], null));

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(transcript.filter((i) => i.type === "response")).toHaveLength(0);
      expect(transcript.filter((i) => i.type === "tool_call").map((i) => i.text)).toEqual(["draw_tile"]);
    });

    it("should record the corrective prompt when the model replies with plain text", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      client.responses.push(plainMessage("Let me think about it..."), plainMessage("Still thinking..."));

      await expect(
        provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
      ).rejects.toThrow(/no tool call/i);

      const transcript = getDebugTranscript(game, aiPlayerId);
      expect(
        transcript.some((i) => i.type === "prompt" && i.text === "Call a tool to take your turn.")
      ).toBe(true);
    });

    it("should not print AI JSON log lines to stdout", async () => {
      vi.stubEnv("AI_DEBUG", "true");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      client.responses.push(
        toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
        toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
      );

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("provider request headers (OpenCode Go)", () => {
    it("should send a stable x-opencode-session header on every completion in a conversation", async () => {
      client.responses.push(
        toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
        toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }])
      );

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });
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

      expect(client.calls).toHaveLength(2);
      const sessionId = client.calls[0].headers?.["x-opencode-session"];
      expect(sessionId).toBeTruthy();
      expect(client.calls[1].headers?.["x-opencode-session"]).toBe(sessionId);
    });

    it("should send a distinct session header per conversation", async () => {
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

      await provider.takeTurn(new AiTurnController(io, twoAiGame, "TEST02", ai1.id), {
        turnNumber: 1,
        eventsNote: "",
      });
      await provider.takeTurn(new AiTurnController(io, twoAiGame, "TEST02", ai2.id), {
        turnNumber: 2,
        eventsNote: "",
      });

      const session1 = client.calls[0].headers?.["x-opencode-session"];
      const session2 = client.calls[1].headers?.["x-opencode-session"];
      expect(session1).toBeTruthy();
      expect(session2).toBeTruthy();
      expect(session2).not.toBe(session1);
    });

    it("should identify the app instead of the SDK with the User-Agent header", async () => {
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      const userAgent = client.calls[0].headers?.["User-Agent"];
      expect(userAgent).toBeTruthy();
      expect(userAgent).not.toMatch(/openai/i);
    });
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

  describe("conversation persistence", () => {
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

    it("should persist the conversation on creation and again at the end of a successful turn", async () => {
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });
      await flushAiWrites();

      const key = `TEST01:1:${aiPlayerId}`;
      const saved = store.saved.filter((s) => s.key === key);
      expect(saved.length).toBeGreaterThanOrEqual(2);
      expect(saved[0].messages).toHaveLength(1);
      expect(saved[0].messages[0].role).toBe("system");

      const last = saved[saved.length - 1].messages;
      expect(last[0].role).toBe("system");
      expect(last[last.length - 1].role).toBe("tool");
      expect(last.some((m) => m.role === "user" && String(m.content).includes("Turn 1"))).toBe(true);
    });

    it("should persist the conversation even when the turn throws", async () => {
      client.responses.push(plainMessage("Let me think about it..."), plainMessage("Still thinking..."));

      await expect(
        provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), { turnNumber: 1, eventsNote: "" })
      ).rejects.toThrow(/no tool call/i);
      await flushAiWrites();

      const key = `TEST01:1:${aiPlayerId}`;
      const last = store.saved.filter((s) => s.key === key).at(-1)!;
      expect(last.messages[0].role).toBe("system");
      expect(last.messages.some((m) => m.content === "Call a tool to take your turn.")).toBe(true);
    });

    it("should persist the compacted conversation in place of the full history", async () => {
      vi.stubEnv("AI_CONTEXT_TOKEN_LIMIT", "50");
      vi.stubEnv("AI_COMPACT_KEEP_TURNS", "1");
      client.responses.push(
        toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]),
        toolCallMessage([{ id: "call-2", name: "draw_tile", arguments: "{}" }]),
        { choices: [{ message: { role: "assistant", content: "The player drew tiles." } }] },
        toolCallMessage([{ id: "call-3", name: "draw_tile", arguments: "{}" }])
      );

      const controller = new AiTurnController(io, game, "TEST01", aiPlayerId);
      await provider.takeTurn(controller, { turnNumber: 1, eventsNote: "" });
      for (const turn of [2, 3]) {
        game.seedGame({
          board: [],
          racks: { p1: [], [aiPlayerId]: [R7] },
          pool: [POOL_TILE],
          currentTurnPlayerId: aiPlayerId,
          hasInitialMeld: { p1: true, [aiPlayerId]: true },
        });
        await provider.takeTurn(controller, { turnNumber: turn, eventsNote: "" });
      }
      await flushAiWrites();

      const key = `TEST01:1:${aiPlayerId}`;
      const compacted = store.saved
        .filter((s) => s.key === key)
        .some((s) => s.messages.some((m) => String(m.content).includes("[Summary of earlier conversation]")));
      expect(compacted).toBe(true);
    });

    it("should restore conversations from the store on boot", async () => {
      store.seeded.push({
        key: `TEST01:1:${aiPlayerId}`,
        messages: [
          { role: "system", content: "RESTORED SYSTEM PROMPT" },
          { role: "user", content: "Turn 1 has started (restored)" },
        ],
      });

      await restoreConversations();

      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));
      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 2,
        eventsNote: "",
      });

      expect(client.calls[0].messages).toHaveLength(3);
      expect(String(client.calls[0].messages[0].content)).toContain("RESTORED SYSTEM PROMPT");
    });

    it("should drop restored conversations on unloadConversations", async () => {
      store.seeded.push({
        key: `TEST01:1:${aiPlayerId}`,
        messages: [{ role: "system", content: "RESTORED SYSTEM PROMPT" }],
      });
      await restoreConversations();
      unloadConversations();

      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));
      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });

      expect(String(client.calls[0].messages[0].content)).toContain("Sabra");
      expect(client.calls[0].messages).toHaveLength(2);
    });

    it("should no-op when no store has been wired", async () => {
      setAiStore(new NoopAiStore());
      client.responses.push(toolCallMessage([{ id: "call-1", name: "draw_tile", arguments: "{}" }]));

      await provider.takeTurn(new AiTurnController(io, game, "TEST01", aiPlayerId), {
        turnNumber: 1,
        eventsNote: "",
      });
      await flushAiWrites();

      expect(getAiStore()).toBeInstanceOf(NoopAiStore);
    });
  });
});

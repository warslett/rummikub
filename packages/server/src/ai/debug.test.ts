import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "../game.js";
import {
  recordDebugItem,
  getDebugTranscript,
  resetTranscripts,
  purgeGame,
  restoreTranscripts,
  unloadTranscripts,
  _clearAllTranscripts,
} from "./debug.js";
import {
  setAiStore,
  flushAiWrites,
  _clearAiWriteQueues,
  NoopAiStore,
} from "../storage/aiStore.js";
import type { AiTranscriptRecord } from "../storage/aiStore.js";
import type { AiDebugEventPayload, AiDebugItem } from "@rummikub/shared";

class FakeAiStore extends NoopAiStore {
  transcripts = new Map<string, AiDebugItem[]>();

  override async upsertTranscript(key: string, items: AiDebugItem[]): Promise<void> {
    this.transcripts.set(key, JSON.parse(JSON.stringify(items)) as AiDebugItem[]);
  }

  override async loadAllTranscripts(): Promise<AiTranscriptRecord[]> {
    return [...this.transcripts.entries()].map(([key, items]) => ({
      key,
      items: JSON.parse(JSON.stringify(items)) as AiDebugItem[],
    }));
  }

  override async deleteTranscriptsBeforeRound(gameCode: string, round: number): Promise<void> {
    for (const key of [...this.transcripts.keys()]) {
      if (!key.startsWith(`${gameCode}:`)) {
        continue;
      }
      const keyRound = Number(key.split(":")[1]);
      if (Number.isFinite(keyRound) && keyRound < round) {
        this.transcripts.delete(key);
      }
    }
  }

  override async deleteGameTranscripts(gameCode: string): Promise<void> {
    for (const key of [...this.transcripts.keys()]) {
      if (key.startsWith(`${gameCode}:`)) {
        this.transcripts.delete(key);
      }
    }
  }
}

function createStubIo() {
  const emitted: { room: string; event: string; data: unknown }[] = [];
  return {
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, data: unknown) => {
        emitted.push({ room, event, data });
      }),
    })),
    emit: vi.fn(),
    sockets: {
      adapter: { rooms: new Map() },
      sockets: new Map(),
    },
    _emitted: emitted,
  } as unknown as SocketIOServer & { _emitted: { room: string; event: string; data: unknown }[] };
}

const R7 = { id: "red-7-a", color: "red" as const, value: 7 as const };
const R8 = { id: "red-8-a", color: "red" as const, value: 8 as const };
const POOL_TILE = { id: "blue-2-a", color: "blue" as const, value: 2 as const };

function createAiGame(gameCode = "TEST01"): { game: Game; aiPlayerId: string } {
  const game = new Game(gameCode);
  game.addPlayer("p1", "Alice");
  const ai = game.addAiPlayer("test-model");
  game.start();
  game.seedGame({
    board: [],
    racks: { p1: [], [ai.id]: [R7, R8] },
    pool: [POOL_TILE],
    currentTurnPlayerId: ai.id,
    hasInitialMeld: { p1: true, [ai.id]: true },
  });
  return { game, aiPlayerId: ai.id };
}

describe("AI debug bus", () => {
  let io: ReturnType<typeof createStubIo>;

  beforeEach(() => {
    _clearAllTranscripts();
    vi.stubEnv("AI_DEBUG", "true");
    io = createStubIo();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should record an item and broadcast ai:debug to the game room with rack captured at emit time", () => {
    const { game, aiPlayerId } = createAiGame();
    const item = { type: "prompt" as const, text: "Turn 1 has started." };

    recordDebugItem(io, game, aiPlayerId, item);

    const events = io._emitted.filter((e) => e.event === "ai:debug");
    expect(events).toHaveLength(1);
    expect(events[0].room).toBe("TEST01");
    const payload = events[0].data as AiDebugEventPayload;
    expect(payload.playerId).toBe(aiPlayerId);
    expect(payload.roundNumber).toBe(1);
    expect(payload.item.type).toBe("prompt");
    expect(payload.item.text).toBe("Turn 1 has started.");
    expect(isNaN(Date.parse(payload.item.ts))).toBe(false);
    expect(payload.rack.map((t) => t.id)).toEqual([R7.id, R8.id]);
  });

  it("should append recorded items to the buffer in order", () => {
    const { game, aiPlayerId } = createAiGame();

    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "Turn 1 has started." });
    recordDebugItem(io, game, aiPlayerId, { type: "tool_call", text: "draw_tile" });

    const transcript = getDebugTranscript(game, aiPlayerId);
    expect(transcript.map((i) => i.type)).toEqual(["prompt", "tool_call"]);
    expect(transcript.map((i) => i.text)).toEqual(["Turn 1 has started.", "draw_tile"]);
  });

  it("should be a no-op when AI_DEBUG is off", () => {
    vi.stubEnv("AI_DEBUG", "false");
    const { game, aiPlayerId } = createAiGame();

    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "Turn 1 has started." });

    expect(io._emitted).toHaveLength(0);
    expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
  });

  it("should reflect the post-action rack when recorded after a game action", () => {
    const { game, aiPlayerId } = createAiGame();
    const player = game.getState().players.find((p) => p.id === aiPlayerId)!;
    player.rack = [R7];

    recordDebugItem(io, game, aiPlayerId, { type: "tool_call", text: "draw_tile" });

    const payload = io._emitted[0].data as AiDebugEventPayload;
    expect(payload.rack.map((t) => t.id)).toEqual([R7.id]);
  });

  it("should keep transcripts isolated per player and per round", () => {
    const { game, aiPlayerId } = createAiGame();
    const other = new Game("OTHER1");
    other.addPlayer("q1", "Quinn");
    const otherAi = other.addAiPlayer("test-model");
    other.start();
    other.seedGame({
      board: [],
      racks: { q1: [], [otherAi.id]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: otherAi.id,
      hasInitialMeld: { q1: true, [otherAi.id]: true },
    });

    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "game A item" });
    recordDebugItem(io, other, otherAi.id, { type: "prompt", text: "game B item" });

    expect(getDebugTranscript(game, aiPlayerId).map((i) => i.text)).toEqual(["game A item"]);
    expect(getDebugTranscript(other, otherAi.id).map((i) => i.text)).toEqual(["game B item"]);
    expect(getDebugTranscript(game, "p1")).toEqual([]);
  });

  it("should drop older-round buffers on resetTranscripts and keep current-round ones", () => {
    const { game, aiPlayerId } = createAiGame();
    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "round 1 item" });

    game.getState().roundNumber = 2;
    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "round 2 item" });

    resetTranscripts("TEST01", 2);

    expect(getDebugTranscript(game, aiPlayerId).map((i) => i.text)).toEqual(["round 2 item"]);
  });

  it("should not reset same-round transcripts when resetTranscripts is called for the current round", () => {
    const { game, aiPlayerId } = createAiGame();
    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "round 1 item" });

    resetTranscripts("TEST01", 1);

    expect(getDebugTranscript(game, aiPlayerId)).toHaveLength(1);
  });

  it("should drop all rounds for a game on purgeGame but keep other games", () => {
    const { game, aiPlayerId } = createAiGame();
    const other = new Game("OTHER1");
    other.addPlayer("q1", "Quinn");
    const otherAi = other.addAiPlayer("test-model");
    other.start();
    other.seedGame({
      board: [],
      racks: { q1: [], [otherAi.id]: [R7] },
      pool: [POOL_TILE],
      currentTurnPlayerId: otherAi.id,
      hasInitialMeld: { q1: true, [otherAi.id]: true },
    });

    recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "game A item" });
    recordDebugItem(io, other, otherAi.id, { type: "prompt", text: "game B item" });

    purgeGame("TEST01");

    expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
    expect(getDebugTranscript(other, otherAi.id).map((i) => i.text)).toEqual(["game B item"]);
  });

  describe("transcript persistence", () => {
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

    it("should persist recorded items when debug is on", async () => {
      const { game, aiPlayerId } = createAiGame();

      recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "Turn 1 has started." });
      recordDebugItem(io, game, aiPlayerId, { type: "tool_call", text: "draw_tile" });
      await flushAiWrites();

      const key = `TEST01:1:${aiPlayerId}`;
      expect(store.transcripts.get(key)?.map((i) => i.text)).toEqual(["Turn 1 has started.", "draw_tile"]);
    });

    it("should not persist anything when debug is off", async () => {
      vi.stubEnv("AI_DEBUG", "false");
      const { game, aiPlayerId } = createAiGame();

      recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "Turn 1 has started." });
      await flushAiWrites();

      expect(store.transcripts.size).toBe(0);
    });

    it("should delete older-round rows on resetTranscripts and all rows on purgeGame", async () => {
      const item: AiDebugItem = { type: "prompt", text: "x", ts: "2024-01-01T00:00:00.000Z" };
      store.transcripts.set("TEST01:1:p1", [item]);
      store.transcripts.set("TEST01:2:p1", [item]);
      store.transcripts.set("OTHER1:1:p1", [item]);

      resetTranscripts("TEST01", 2);
      await flushAiWrites();
      expect(store.transcripts.has("TEST01:1:p1")).toBe(false);
      expect(store.transcripts.has("TEST01:2:p1")).toBe(true);

      purgeGame("TEST01");
      await flushAiWrites();
      expect(store.transcripts.has("TEST01:2:p1")).toBe(false);
      expect(store.transcripts.has("OTHER1:1:p1")).toBe(true);
    });

    it("should restore transcripts from the store into the map", async () => {
      const { game, aiPlayerId } = createAiGame();
      store.transcripts.set(`TEST01:1:${aiPlayerId}`, [
        { type: "prompt", text: "restored item", ts: "2024-01-01T00:00:00.000Z" },
      ]);

      await restoreTranscripts();

      expect(getDebugTranscript(game, aiPlayerId).map((i) => i.text)).toEqual(["restored item"]);
    });

    it("should not restore transcripts when debug is off", async () => {
      const { game, aiPlayerId } = createAiGame();
      store.transcripts.set(`TEST01:1:${aiPlayerId}`, [
        { type: "prompt", text: "restored item", ts: "2024-01-01T00:00:00.000Z" },
      ]);

      vi.stubEnv("AI_DEBUG", "false");
      await restoreTranscripts();
      vi.stubEnv("AI_DEBUG", "true");

      expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
    });

    it("should preserve existing transcripts when loading them fails", async () => {
      const { game, aiPlayerId } = createAiGame();
      recordDebugItem(io, game, aiPlayerId, { type: "prompt", text: "existing item" });
      vi.spyOn(store, "loadAllTranscripts").mockRejectedValue(new Error("db down"));

      await expect(restoreTranscripts()).rejects.toThrow("db down");

      expect(getDebugTranscript(game, aiPlayerId).map((i) => i.text)).toEqual(["existing item"]);
    });

    it("should drop all transcripts on unloadTranscripts", async () => {
      const { game, aiPlayerId } = createAiGame();
      store.transcripts.set(`TEST01:1:${aiPlayerId}`, [
        { type: "prompt", text: "restored item", ts: "2024-01-01T00:00:00.000Z" },
      ]);
      await restoreTranscripts();

      unloadTranscripts();

      expect(getDebugTranscript(game, aiPlayerId)).toEqual([]);
    });
  });
});

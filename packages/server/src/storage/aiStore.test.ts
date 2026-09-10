import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { newDb } from "pg-mem";
import type pg from "pg";
import {
  PostgresAiStore,
  NoopAiStore,
  createAiStore,
  queueAiWrite,
  flushAiWrites,
  _clearAiWriteQueues,
} from "./aiStore.js";
import type { AiTurnTrackingData } from "./aiStore.js";
import { ensureSchema } from "./db.js";
import type { AiDebugItem } from "@rummikub/shared";

function createMemPool(): pg.Pool {
  const db = newDb();
  const adapter = db.adapters.createPg();
  return new adapter.Pool();
}

function makeTracking(turnNumber: number): AiTurnTrackingData {
  return {
    roundNumber: 1,
    turnNumber,
    baseline: { boardTileCount: 0, consecutivePasses: 0, rackSizes: { p1: 14, p2: 14 } },
    observations: {
      p2: { boardTileCount: 3, consecutivePasses: 0, rackSizes: { p1: 13, p2: 14 } },
    },
  };
}

function makeDebugItem(text: string): AiDebugItem {
  return { type: "prompt", text, ts: "2024-01-01T00:00:00.000Z" };
}

async function insertGame(pool: pg.Pool, code: string): Promise<void> {
  await pool.query(
    `INSERT INTO games (game_code, phase, state, created_at, last_activity_at)
     VALUES ($1, 'playing', '{}'::jsonb, now(), now())`,
    [code]
  );
}

describe("PostgresAiStore", () => {
  let pool: pg.Pool;
  let store: PostgresAiStore;

  beforeEach(async () => {
    pool = createMemPool();
    await ensureSchema(pool);
    store = new PostgresAiStore(pool);
  });

  describe("conversations", () => {
    it("should round-trip and update a conversation by key", async () => {
      await insertGame(pool, "ABC123");
      const key = "ABC123:1:p1";
      const messages = [
        { role: "system", content: "You are an AI" },
        { role: "user", content: "Turn 1 has started" },
      ] as const;

      await store.upsertConversation(key, [...messages]);
      let loaded = await store.loadAllConversations();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe(key);
      expect(loaded[0].messages).toEqual([...messages]);

      await store.upsertConversation(key, [...messages, { role: "assistant", content: "hi" }]);
      loaded = await store.loadAllConversations();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].messages).toHaveLength(3);
    });

    it("should delete only conversations from rounds before the given round", async () => {
      await insertGame(pool, "ABC123");
      await store.upsertConversation("ABC123:1:p1", [{ role: "system", content: "r1" }]);
      await store.upsertConversation("ABC123:2:p1", [{ role: "system", content: "r2" }]);
      await store.upsertConversation("ABC123:3:p1", [{ role: "system", content: "r3" }]);

      await store.deleteConversationsBeforeRound("ABC123", 2);

      const loaded = await store.loadAllConversations();
      expect(loaded.map((c) => c.key).sort()).toEqual(["ABC123:2:p1", "ABC123:3:p1"]);
    });

    it("should delete all conversations for one game only", async () => {
      await insertGame(pool, "ABC123");
      await insertGame(pool, "XYZ789");
      await store.upsertConversation("ABC123:1:p1", [{ role: "system", content: "a" }]);
      await store.upsertConversation("XYZ789:1:p1", [{ role: "system", content: "b" }]);

      await store.deleteGameConversations("ABC123");

      const loaded = await store.loadAllConversations();
      expect(loaded.map((c) => c.key)).toEqual(["XYZ789:1:p1"]);
    });
  });

  describe("turn tracking", () => {
    it("should round-trip and update turn tracking per game", async () => {
      await insertGame(pool, "ABC123");
      await store.upsertTurnTracking("ABC123", makeTracking(3));

      let loaded = await store.loadAllTurnTracking();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].gameCode).toBe("ABC123");
      expect(loaded[0].data.turnNumber).toBe(3);
      expect(loaded[0].data.observations.p2.boardTileCount).toBe(3);

      await store.upsertTurnTracking("ABC123", makeTracking(4));
      loaded = await store.loadAllTurnTracking();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].data.turnNumber).toBe(4);
    });

    it("should delete turn tracking for a game", async () => {
      await insertGame(pool, "ABC123");
      await store.upsertTurnTracking("ABC123", makeTracking(1));
      await store.deleteTurnTracking("ABC123");
      expect(await store.loadAllTurnTracking()).toEqual([]);
    });
  });

  describe("AI errors", () => {
    it("should round-trip, update and delete AI errors", async () => {
      await insertGame(pool, "ABC123");
      await store.upsertAiError("ABC123", "p2", "boom");

      let loaded = await store.loadAllAiErrors();
      expect(loaded).toEqual([{ gameCode: "ABC123", playerId: "p2", message: "boom" }]);

      await store.upsertAiError("ABC123", "p2", "boom again");
      loaded = await store.loadAllAiErrors();
      expect(loaded).toEqual([{ gameCode: "ABC123", playerId: "p2", message: "boom again" }]);

      await store.deleteAiError("ABC123", "p2");
      expect(await store.loadAllAiErrors()).toEqual([]);
    });

    it("should delete all AI errors for a game only", async () => {
      await insertGame(pool, "ABC123");
      await insertGame(pool, "XYZ789");
      await store.upsertAiError("ABC123", "p1", "a");
      await store.upsertAiError("ABC123", "p2", "b");
      await store.upsertAiError("XYZ789", "p1", "c");

      await store.deleteGameAiErrors("ABC123");

      const loaded = await store.loadAllAiErrors();
      expect(loaded).toEqual([{ gameCode: "XYZ789", playerId: "p1", message: "c" }]);
    });
  });

  describe("debug transcripts", () => {
    it("should round-trip and update a transcript by key", async () => {
      await insertGame(pool, "ABC123");
      const key = "ABC123:1:p1";
      await store.upsertTranscript(key, [makeDebugItem("first")]);

      let loaded = await store.loadAllTranscripts();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe(key);
      expect(loaded[0].items.map((i) => i.text)).toEqual(["first"]);

      await store.upsertTranscript(key, [makeDebugItem("first"), makeDebugItem("second")]);
      loaded = await store.loadAllTranscripts();
      expect(loaded[0].items.map((i) => i.text)).toEqual(["first", "second"]);
    });

    it("should delete only transcripts from rounds before the given round", async () => {
      await insertGame(pool, "ABC123");
      await store.upsertTranscript("ABC123:1:p1", [makeDebugItem("r1")]);
      await store.upsertTranscript("ABC123:2:p1", [makeDebugItem("r2")]);

      await store.deleteTranscriptsBeforeRound("ABC123", 2);

      const loaded = await store.loadAllTranscripts();
      expect(loaded.map((t) => t.key)).toEqual(["ABC123:2:p1"]);
    });

    it("should delete all transcripts for one game only", async () => {
      await insertGame(pool, "ABC123");
      await insertGame(pool, "XYZ789");
      await store.upsertTranscript("ABC123:1:p1", [makeDebugItem("a")]);
      await store.upsertTranscript("XYZ789:1:p1", [makeDebugItem("b")]);

      await store.deleteGameTranscripts("ABC123");

      const loaded = await store.loadAllTranscripts();
      expect(loaded.map((t) => t.key)).toEqual(["XYZ789:1:p1"]);
    });
  });

  it("should cascade-delete all AI rows when the parent game is deleted", async () => {
    await insertGame(pool, "ABC123");
    await store.upsertConversation("ABC123:1:p1", [{ role: "system", content: "c" }]);
    await store.upsertTurnTracking("ABC123", makeTracking(1));
    await store.upsertAiError("ABC123", "p1", "e");
    await store.upsertTranscript("ABC123:1:p1", [makeDebugItem("t")]);

    await pool.query("DELETE FROM games WHERE game_code = $1", ["ABC123"]);

    expect(await store.loadAllConversations()).toEqual([]);
    expect(await store.loadAllTurnTracking()).toEqual([]);
    expect(await store.loadAllAiErrors()).toEqual([]);
    expect(await store.loadAllTranscripts()).toEqual([]);
  });
});

describe("NoopAiStore", () => {
  it("should no-op all methods", async () => {
    const store = new NoopAiStore();
    await expect(store.upsertConversation("k", [])).resolves.toBeUndefined();
    await expect(store.loadAllConversations()).resolves.toEqual([]);
    await expect(store.deleteConversationsBeforeRound("g", 2)).resolves.toBeUndefined();
    await expect(store.deleteGameConversations("g")).resolves.toBeUndefined();
    await expect(store.upsertTurnTracking("g", makeTracking(1))).resolves.toBeUndefined();
    await expect(store.loadAllTurnTracking()).resolves.toEqual([]);
    await expect(store.deleteTurnTracking("g")).resolves.toBeUndefined();
    await expect(store.upsertAiError("g", "p", "m")).resolves.toBeUndefined();
    await expect(store.loadAllAiErrors()).resolves.toEqual([]);
    await expect(store.deleteAiError("g", "p")).resolves.toBeUndefined();
    await expect(store.deleteGameAiErrors("g")).resolves.toBeUndefined();
    await expect(store.upsertTranscript("k", [])).resolves.toBeUndefined();
    await expect(store.loadAllTranscripts()).resolves.toEqual([]);
    await expect(store.deleteTranscriptsBeforeRound("g", 2)).resolves.toBeUndefined();
    await expect(store.deleteGameTranscripts("g")).resolves.toBeUndefined();
  });
});

describe("createAiStore", () => {
  it("should return a NoopAiStore when persistence is disabled", () => {
    const store = createAiStore({ databaseUrl: "", enabled: false });
    expect(store).toBeInstanceOf(NoopAiStore);
  });

  it("should return a PostgresAiStore backed by the supplied databaseUrl", () => {
    const store = createAiStore({ databaseUrl: "postgres://u:p@custom-host:5432/db", enabled: true });
    expect(store).toBeInstanceOf(PostgresAiStore);
  });
});

describe("flushAiWrites", () => {
  beforeEach(() => {
    _clearAiWriteQueues();
  });

  afterEach(() => {
    _clearAiWriteQueues();
  });

  it("should drain writes queued for the same key while flushing", async () => {
    const applied: string[] = [];
    let releaseSecond: () => void = () => {};
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    queueAiWrite("aiconv:TEST01", async () => {
      applied.push("first");
      queueAiWrite("aiconv:TEST01", async () => {
        await secondGate;
        applied.push("second");
      });
    });

    let flushed = false;
    const flush = flushAiWrites().then(() => {
      flushed = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(flushed).toBe(false);

    releaseSecond();
    await flush;
    expect(applied).toEqual(["first", "second"]);
  });
});

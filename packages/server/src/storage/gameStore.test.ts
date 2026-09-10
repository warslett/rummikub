import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import type pg from "pg";
import { PostgresGameStore, NoopGameStore, createGameStore } from "./gameStore.js";
import { ensureSchema } from "./db.js";
import type { GameState, Tile, TileSet } from "@rummikub/shared";

function createMemPool(): pg.Pool {
  const db = newDb();
  const adapter = db.adapters.createPg();
  return new adapter.Pool();
}

function makeTile(id: string, color: Tile["color"], value: number): Tile {
  return { id, color, value: value as Tile["value"] };
}

function makeSet(id: string, tiles: Tile[]): TileSet {
  return { id, tiles };
}

function makeRealisticState(id: string, lastActivityAt: number): GameState {
  return {
    id,
    phase: "playing",
    players: [
      {
        id: "p1",
        name: "Alice",
        rack: [makeTile("red-1-a", "red", 1), makeTile("blue-5-b", "blue", 5)],
        hasInitialMeld: true,
        score: 42,
        connected: true,
        gamesWon: 1,
      },
      {
        id: "p2",
        name: "Bob",
        rack: [makeTile("black-9-a", "black", 9)],
        hasInitialMeld: false,
        score: -12,
        connected: false,
        gamesWon: 0,
        isAI: true,
        model: "test-model",
      },
    ],
    currentTurnIndex: 1,
    board: [
      makeSet("s1", [makeTile("red-7-a", "red", 7), makeTile("red-8-a", "red", 8), makeTile("red-9-a", "red", 9)]),
    ],
    pool: [makeTile("joker-1", "joker", 0), makeTile("orange-3-a", "orange", 3)],
    turnActions: [{ type: "placeSet", tiles: [makeTile("red-7-a", "red", 7)] }],
    turnSnapshot: {
      board: [],
      rack: [makeTile("red-1-a", "red", 1)],
    },
    roundNumber: 2,
    consecutivePasses: 1,
    createdAt: 1700000000000,
    lastActivityAt,
    seededScripts: {
      p2: [{ action: "drawTile" }],
    },
  };
}

describe("PostgresGameStore", () => {
  let pool: pg.Pool;
  let store: PostgresGameStore;

  beforeEach(async () => {
    pool = createMemPool();
    await ensureSchema(pool);
    store = new PostgresGameStore(pool);
  });

  it("should insert a game on first upsert and update it in place on the second", async () => {
    const state = makeRealisticState("ABC123", 1700000001000);
    await store.upsertGame(state);

    const rows = await pool.query("SELECT game_code, phase, created_at, last_activity_at FROM games");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].game_code).toBe("ABC123");
    expect(rows.rows[0].phase).toBe("playing");

    const updated = makeRealisticState("ABC123", 1700000002000);
    updated.phase = "ended";
    await store.upsertGame(updated);

    const rows2 = await pool.query("SELECT game_code, phase, last_activity_at FROM games");
    expect(rows2.rows).toHaveLength(1);
    expect(rows2.rows[0].phase).toBe("ended");
  });

  it("should round-trip a realistic GameState losslessly", async () => {
    const state = makeRealisticState("ABC123", 1700000001000);
    await store.upsertGame(state);

    const loaded = await store.loadAllGames();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(state);
  });

  it("should delete a game by code", async () => {
    await store.upsertGame(makeRealisticState("ABC123", 1700000001000));
    await store.deleteGame("ABC123");
    expect(await store.loadAllGames()).toHaveLength(0);
  });

  it("should delete expired games and return their codes", async () => {
    await store.upsertGame(makeRealisticState("OLD01", 1700000000000));
    await store.upsertGame(makeRealisticState("NEW01", 1700000100000));

    const deleted = await store.deleteExpiredGames(1700000050000);
    expect(deleted).toEqual(["OLD01"]);
    const remaining = await store.loadAllGames();
    expect(remaining.map((g) => g.id)).toEqual(["NEW01"]);
  });

  it("should treat the expiry boundary as inclusive (not expired)", async () => {
    await store.upsertGame(makeRealisticState("EDGE1", 1700000050000));
    const deleted = await store.deleteExpiredGames(1700000050000);
    expect(deleted).toEqual([]);
  });
});

describe("NoopGameStore", () => {
  let store: NoopGameStore;

  beforeEach(() => {
    store = new NoopGameStore();
  });

  it("should no-op all methods", async () => {
    await expect(store.upsertGame(makeRealisticState("ABC123", 1))).resolves.toBeUndefined();
    await expect(store.loadAllGames()).resolves.toEqual([]);
    await expect(store.deleteGame("ABC123")).resolves.toBeUndefined();
    await expect(store.deleteExpiredGames(1)).resolves.toEqual([]);
    await expect(store.close()).resolves.toBeUndefined();
  });
});

describe("createGameStore", () => {
  it("should return a NoopGameStore when persistence is disabled", () => {
    const store = createGameStore({ databaseUrl: "", enabled: false });
    expect(store).toBeInstanceOf(NoopGameStore);
  });

  it("should return a PostgresGameStore backed by the supplied databaseUrl", async () => {
    const store = createGameStore({ databaseUrl: "postgres://u:p@custom-host:5432/db", enabled: true });
    expect(store).toBeInstanceOf(PostgresGameStore);
    const pool = (store as unknown as { pool: pg.Pool }).pool;
    expect(pool.options.connectionString).toBe("postgres://u:p@custom-host:5432/db");
    expect(pool.options.connectionTimeoutMillis).toBe(5000);
    await store.close();
  });
});

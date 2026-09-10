import pg from "pg";
import { storageConfig } from "./config.js";

const CONNECTION_TIMEOUT_MS = 5000;

let pool: pg.Pool | null = null;
let poolUrl: string | null = null;

export function createPool(databaseUrl: string): pg.Pool {
  const newPool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  newPool.on("error", (err) => {
    console.error("Unexpected error on idle postgres client:", err.message);
  });
  return newPool;
}

export function getPool(databaseUrl: string = storageConfig.databaseUrl): pg.Pool {
  if (!pool || poolUrl !== databaseUrl) {
    const previous = pool;
    pool = createPool(databaseUrl);
    poolUrl = databaseUrl;
    if (previous) {
      void previous.end().catch(() => {});
    }
  }
  return pool;
}

export async function ensureSchema(pool: pg.Pool = getPool()): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      game_code TEXT PRIMARY KEY,
      phase TEXT NOT NULL,
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_activity_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      game_code TEXT NOT NULL REFERENCES games(game_code) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      messages JSONB NOT NULL,
      PRIMARY KEY (game_code, round_number, player_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_turn_tracking (
      game_code TEXT PRIMARY KEY REFERENCES games(game_code) ON DELETE CASCADE,
      data JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_errors (
      game_code TEXT NOT NULL REFERENCES games(game_code) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      message TEXT NOT NULL,
      PRIMARY KEY (game_code, player_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_debug_transcripts (
      game_code TEXT NOT NULL REFERENCES games(game_code) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      items JSONB NOT NULL,
      PRIMARY KEY (game_code, round_number, player_id)
    )
  `);
}

export async function dbHealth(pool: pg.Pool = getPool()): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function ensureSchemaWithRetries(
  maxRetries: number = 5,
  retryDelayMs: number = 2000,
  schemaFn: () => Promise<void> = ensureSchema
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await schemaFn();
      return;
    } catch (err) {
      console.error(`Database unreachable (attempt ${attempt}/${maxRetries}):`, (err as Error).message);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  console.error("Database is unreachable after retries. Exiting.");
  process.exit(1);
}

export async function releasePool(target: pg.Pool): Promise<void> {
  if (pool === target) {
    pool = null;
    poolUrl = null;
  }
  await target.end();
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    poolUrl = null;
    await current.end();
  }
}

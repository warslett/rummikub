import type pg from "pg";
import type { GameState } from "@rummikub/shared";
import { getPool, releasePool } from "./db.js";
import { storageConfig } from "./config.js";
import type { StorageConfig } from "./config.js";

export interface GameStore {
  upsertGame(state: GameState): Promise<void>;
  loadAllGames(): Promise<GameState[]>;
  deleteGame(code: string): Promise<void>;
  deleteExpiredGames(cutoffMs: number): Promise<string[]>;
  close(): Promise<void>;
}

export class PostgresGameStore implements GameStore {
  constructor(private pool: pg.Pool) {}

  async upsertGame(state: GameState): Promise<void> {
    await this.pool.query(
      `INSERT INTO games (game_code, phase, state, created_at, last_activity_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
       ON CONFLICT (game_code) DO UPDATE SET
         phase = EXCLUDED.phase,
         state = EXCLUDED.state,
         last_activity_at = EXCLUDED.last_activity_at`,
      [
        state.id,
        state.phase,
        JSON.stringify(state),
        new Date(state.createdAt).toISOString(),
        new Date(state.lastActivityAt).toISOString(),
      ]
    );
  }

  async loadAllGames(): Promise<GameState[]> {
    const result = await this.pool.query("SELECT state FROM games");
    return result.rows.map((row) => row.state as GameState);
  }

  async deleteGame(code: string): Promise<void> {
    await this.pool.query("DELETE FROM games WHERE game_code = $1", [code]);
  }

  async deleteExpiredGames(cutoffMs: number): Promise<string[]> {
    const result = await this.pool.query(
      "DELETE FROM games WHERE last_activity_at < $1::timestamptz RETURNING game_code",
      [new Date(cutoffMs).toISOString()]
    );
    return result.rows.map((row) => row.game_code as string);
  }

  async close(): Promise<void> {
    await releasePool(this.pool);
  }
}

export class NoopGameStore implements GameStore {
  async upsertGame(_state: GameState): Promise<void> {}

  async loadAllGames(): Promise<GameState[]> {
    return [];
  }

  async deleteGame(_code: string): Promise<void> {}

  async deleteExpiredGames(_cutoffMs: number): Promise<string[]> {
    return [];
  }

  async close(): Promise<void> {}
}

export function createGameStore(config: StorageConfig = storageConfig, pool?: pg.Pool): GameStore {
  if (!config.enabled) {
    return new NoopGameStore();
  }
  return new PostgresGameStore(pool ?? getPool(config.databaseUrl));
}

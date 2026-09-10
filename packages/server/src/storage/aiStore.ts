import type pg from "pg";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { AiDebugItem } from "@rummikub/shared";
import { getPool } from "./db.js";
import { storageConfig } from "./config.js";
import type { StorageConfig } from "./config.js";

export interface AiTurnObservation {
  boardTileCount: number;
  consecutivePasses: number;
  rackSizes: Record<string, number>;
}

export interface AiTurnTrackingData {
  roundNumber: number;
  turnNumber: number;
  baseline: AiTurnObservation;
  observations: Record<string, AiTurnObservation>;
}

export interface AiConversationRecord {
  key: string;
  messages: ChatCompletionMessageParam[];
}

export interface AiTranscriptRecord {
  key: string;
  items: AiDebugItem[];
}

export interface AiErrorRecord {
  gameCode: string;
  playerId: string;
  message: string;
}

export interface AiTurnTrackingRecord {
  gameCode: string;
  data: AiTurnTrackingData;
}

export interface AiStore {
  upsertConversation(key: string, messages: ChatCompletionMessageParam[]): Promise<void>;
  loadAllConversations(): Promise<AiConversationRecord[]>;
  deleteConversationsBeforeRound(gameCode: string, round: number): Promise<void>;
  deleteGameConversations(gameCode: string): Promise<void>;

  upsertTurnTracking(gameCode: string, data: AiTurnTrackingData): Promise<void>;
  loadAllTurnTracking(): Promise<AiTurnTrackingRecord[]>;
  deleteTurnTracking(gameCode: string): Promise<void>;

  upsertAiError(gameCode: string, playerId: string, message: string): Promise<void>;
  loadAllAiErrors(): Promise<AiErrorRecord[]>;
  deleteAiError(gameCode: string, playerId: string): Promise<void>;
  deleteGameAiErrors(gameCode: string): Promise<void>;

  upsertTranscript(key: string, items: AiDebugItem[]): Promise<void>;
  loadAllTranscripts(): Promise<AiTranscriptRecord[]>;
  deleteTranscriptsBeforeRound(gameCode: string, round: number): Promise<void>;
  deleteGameTranscripts(gameCode: string): Promise<void>;
}

function parseRecordKey(key: string): { gameCode: string; roundNumber: number; playerId: string } {
  const [gameCode, roundPart, ...rest] = key.split(":");
  return {
    gameCode,
    roundNumber: Number(roundPart),
    playerId: rest.join(":"),
  };
}

export class PostgresAiStore implements AiStore {
  constructor(private pool: pg.Pool) {}

  async upsertConversation(key: string, messages: ChatCompletionMessageParam[]): Promise<void> {
    const { gameCode, roundNumber, playerId } = parseRecordKey(key);
    await this.pool.query(
      `INSERT INTO ai_conversations (game_code, round_number, player_id, messages)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (game_code, round_number, player_id) DO UPDATE SET
         messages = EXCLUDED.messages`,
      [gameCode, roundNumber, playerId, JSON.stringify(messages)]
    );
  }

  async loadAllConversations(): Promise<AiConversationRecord[]> {
    const result = await this.pool.query(
      "SELECT game_code, round_number, player_id, messages FROM ai_conversations"
    );
    return result.rows.map((row) => ({
      key: `${row.game_code}:${row.round_number}:${row.player_id}`,
      messages: row.messages as ChatCompletionMessageParam[],
    }));
  }

  async deleteConversationsBeforeRound(gameCode: string, round: number): Promise<void> {
    await this.pool.query(
      "DELETE FROM ai_conversations WHERE game_code = $1 AND round_number < $2",
      [gameCode, round]
    );
  }

  async deleteGameConversations(gameCode: string): Promise<void> {
    await this.pool.query("DELETE FROM ai_conversations WHERE game_code = $1", [gameCode]);
  }

  async upsertTurnTracking(gameCode: string, data: AiTurnTrackingData): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_turn_tracking (game_code, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (game_code) DO UPDATE SET data = EXCLUDED.data`,
      [gameCode, JSON.stringify(data)]
    );
  }

  async loadAllTurnTracking(): Promise<AiTurnTrackingRecord[]> {
    const result = await this.pool.query("SELECT game_code, data FROM ai_turn_tracking");
    return result.rows.map((row) => ({
      gameCode: row.game_code as string,
      data: row.data as AiTurnTrackingData,
    }));
  }

  async deleteTurnTracking(gameCode: string): Promise<void> {
    await this.pool.query("DELETE FROM ai_turn_tracking WHERE game_code = $1", [gameCode]);
  }

  async upsertAiError(gameCode: string, playerId: string, message: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_errors (game_code, player_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (game_code, player_id) DO UPDATE SET message = EXCLUDED.message`,
      [gameCode, playerId, message]
    );
  }

  async loadAllAiErrors(): Promise<AiErrorRecord[]> {
    const result = await this.pool.query("SELECT game_code, player_id, message FROM ai_errors");
    return result.rows.map((row) => ({
      gameCode: row.game_code as string,
      playerId: row.player_id as string,
      message: row.message as string,
    }));
  }

  async deleteAiError(gameCode: string, playerId: string): Promise<void> {
    await this.pool.query("DELETE FROM ai_errors WHERE game_code = $1 AND player_id = $2", [
      gameCode,
      playerId,
    ]);
  }

  async deleteGameAiErrors(gameCode: string): Promise<void> {
    await this.pool.query("DELETE FROM ai_errors WHERE game_code = $1", [gameCode]);
  }

  async upsertTranscript(key: string, items: AiDebugItem[]): Promise<void> {
    const { gameCode, roundNumber, playerId } = parseRecordKey(key);
    await this.pool.query(
      `INSERT INTO ai_debug_transcripts (game_code, round_number, player_id, items)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (game_code, round_number, player_id) DO UPDATE SET
         items = EXCLUDED.items`,
      [gameCode, roundNumber, playerId, JSON.stringify(items)]
    );
  }

  async loadAllTranscripts(): Promise<AiTranscriptRecord[]> {
    const result = await this.pool.query(
      "SELECT game_code, round_number, player_id, items FROM ai_debug_transcripts"
    );
    return result.rows.map((row) => ({
      key: `${row.game_code}:${row.round_number}:${row.player_id}`,
      items: row.items as AiDebugItem[],
    }));
  }

  async deleteTranscriptsBeforeRound(gameCode: string, round: number): Promise<void> {
    await this.pool.query(
      "DELETE FROM ai_debug_transcripts WHERE game_code = $1 AND round_number < $2",
      [gameCode, round]
    );
  }

  async deleteGameTranscripts(gameCode: string): Promise<void> {
    await this.pool.query("DELETE FROM ai_debug_transcripts WHERE game_code = $1", [gameCode]);
  }
}

export class NoopAiStore implements AiStore {
  async upsertConversation(_key: string, _messages: ChatCompletionMessageParam[]): Promise<void> {}
  async loadAllConversations(): Promise<AiConversationRecord[]> {
    return [];
  }
  async deleteConversationsBeforeRound(_gameCode: string, _round: number): Promise<void> {}
  async deleteGameConversations(_gameCode: string): Promise<void> {}

  async upsertTurnTracking(_gameCode: string, _data: AiTurnTrackingData): Promise<void> {}
  async loadAllTurnTracking(): Promise<AiTurnTrackingRecord[]> {
    return [];
  }
  async deleteTurnTracking(_gameCode: string): Promise<void> {}

  async upsertAiError(_gameCode: string, _playerId: string, _message: string): Promise<void> {}
  async loadAllAiErrors(): Promise<AiErrorRecord[]> {
    return [];
  }
  async deleteAiError(_gameCode: string, _playerId: string): Promise<void> {}
  async deleteGameAiErrors(_gameCode: string): Promise<void> {}

  async upsertTranscript(_key: string, _items: AiDebugItem[]): Promise<void> {}
  async loadAllTranscripts(): Promise<AiTranscriptRecord[]> {
    return [];
  }
  async deleteTranscriptsBeforeRound(_gameCode: string, _round: number): Promise<void> {}
  async deleteGameTranscripts(_gameCode: string): Promise<void> {}
}

export function createAiStore(config: StorageConfig = storageConfig, pool?: pg.Pool): AiStore {
  if (!config.enabled) {
    return new NoopAiStore();
  }
  return new PostgresAiStore(pool ?? getPool(config.databaseUrl));
}

let activeStore: AiStore = new NoopAiStore();

export function setAiStore(store: AiStore): void {
  activeStore = store;
}

export function getAiStore(): AiStore {
  return activeStore;
}

const writeQueues = new Map<string, Promise<void>>();

export function queueAiWrite(key: string, task: () => Promise<void>): void {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    try {
      await task();
    } catch (err) {
      console.error(`Failed to persist AI state ${key}:`, err);
    }
  });
  writeQueues.set(key, next);
  void next.finally(() => {
    if (writeQueues.get(key) === next) {
      writeQueues.delete(key);
    }
  });
}

export async function flushAiWrites(): Promise<void> {
  while (writeQueues.size > 0) {
    await Promise.all([...writeQueues.values()]);
  }
}

export function _clearAiWriteQueues(): void {
  writeQueues.clear();
}

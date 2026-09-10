import type { Server as SocketIOServer } from "socket.io";
import type { AiDebugItem, AiDebugEventPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";
import type { Game } from "../game.js";
import { queueAiWrite, getAiStore } from "../storage/aiStore.js";

const transcripts = new Map<string, AiDebugItem[]>();

function transcriptKey(gameCode: string, roundNumber: number, playerId: string): string {
  return `${gameCode}:${roundNumber}:${playerId}`;
}

export function recordDebugItem(
  io: SocketIOServer,
  game: Game,
  playerId: string,
  item: Omit<AiDebugItem, "ts">
): void {
  if (!aiConfig.debug) {
    return;
  }
  const state = game.getState();
  const recorded: AiDebugItem = { ...item, ts: new Date().toISOString() };
  const key = transcriptKey(state.id, state.roundNumber, playerId);
  const items = transcripts.get(key) ?? [];
  items.push(recorded);
  transcripts.set(key, items);

  const snapshot = items.map((entry) => ({ ...entry }));
  queueAiWrite(`aitranscript:${state.id}`, () => getAiStore().upsertTranscript(key, snapshot));

  const player = state.players.find((p) => p.id === playerId);
  const payload: AiDebugEventPayload = {
    playerId,
    roundNumber: state.roundNumber,
    item: recorded,
    rack: player ? [...player.rack] : [],
  };
  io.to(state.id).emit("ai:debug", payload);
}

export async function restoreTranscripts(): Promise<void> {
  if (!aiConfig.debug) {
    transcripts.clear();
    return;
  }
  const records = await getAiStore().loadAllTranscripts();
  transcripts.clear();
  for (const record of records) {
    transcripts.set(record.key, record.items);
  }
}

export function unloadTranscripts(): void {
  transcripts.clear();
}

export function getDebugTranscript(game: Game, playerId: string): AiDebugItem[] {
  if (!aiConfig.debug) {
    return [];
  }
  const state = game.getState();
  const items = transcripts.get(transcriptKey(state.id, state.roundNumber, playerId));
  return items ? items.map((item) => ({ ...item })) : [];
}

export function resetTranscripts(gameCode: string, roundNumber: number): void {
  for (const key of [...transcripts.keys()]) {
    if (!key.startsWith(`${gameCode}:`)) {
      continue;
    }
    const keyRound = Number(key.split(":")[1]);
    if (Number.isFinite(keyRound) && keyRound < roundNumber) {
      transcripts.delete(key);
    }
  }
  queueAiWrite(`aitranscript:${gameCode}`, () =>
    getAiStore().deleteTranscriptsBeforeRound(gameCode, roundNumber)
  );
}

export function purgeGame(gameCode: string): void {
  for (const key of [...transcripts.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      transcripts.delete(key);
    }
  }
  queueAiWrite(`aitranscript:${gameCode}`, () =>
    getAiStore().deleteGameTranscripts(gameCode)
  );
}

export function _clearAllTranscripts(): void {
  transcripts.clear();
}

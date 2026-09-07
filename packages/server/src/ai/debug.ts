import type { Server as SocketIOServer } from "socket.io";
import type { AiDebugItem, AiDebugEventPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";
import type { Game } from "../game.js";

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

  const player = state.players.find((p) => p.id === playerId);
  const payload: AiDebugEventPayload = {
    playerId,
    roundNumber: state.roundNumber,
    item: recorded,
    rack: player ? [...player.rack] : [],
  };
  io.to(state.id).emit("ai:debug", payload);
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
}

export function purgeGame(gameCode: string): void {
  for (const key of [...transcripts.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      transcripts.delete(key);
    }
  }
}

export function _clearAllTranscripts(): void {
  transcripts.clear();
}

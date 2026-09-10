import type { Server as SocketIOServer } from "socket.io";
import type { Game } from "../game.js";
import type { GameState } from "@rummikub/shared";
import type { AiErrorPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import { AiTurnController } from "./controller.js";
import type { TurnContext } from "./providers/types.js";
import { queueAiWrite, getAiStore } from "../storage/aiStore.js";
import type { AiTurnTrackingData } from "../storage/aiStore.js";

const busyGames = new Set<string>();
const aiErrors = new Map<string, string>();

function aiErrorKey(gameCode: string, playerId: string): string {
  return `${gameCode}:${playerId}`;
}

interface TurnObservation {
  boardTileCount: number;
  consecutivePasses: number;
  rackSizes: Record<string, number>;
}

interface GameTurnTracking {
  roundNumber: number;
  turnNumber: number;
  baseline: TurnObservation;
  observations: Map<string, TurnObservation>;
}

const turnTracking = new Map<string, GameTurnTracking>();

function serializeTracking(tracking: GameTurnTracking): AiTurnTrackingData {
  return {
    roundNumber: tracking.roundNumber,
    turnNumber: tracking.turnNumber,
    baseline: tracking.baseline,
    observations: Object.fromEntries(tracking.observations),
  };
}

function deserializeTracking(data: AiTurnTrackingData): GameTurnTracking {
  return {
    roundNumber: data.roundNumber,
    turnNumber: data.turnNumber,
    baseline: data.baseline,
    observations: new Map(Object.entries(data.observations)),
  };
}

function persistTurnTracking(gameCode: string, tracking: GameTurnTracking): void {
  const snapshot = JSON.parse(JSON.stringify(serializeTracking(tracking))) as AiTurnTrackingData;
  queueAiWrite(`aitracking:${gameCode}`, () =>
    getAiStore().upsertTurnTracking(gameCode, snapshot)
  );
}

function persistAiError(gameCode: string, playerId: string, message: string): void {
  queueAiWrite(`aierrors:${gameCode}`, () =>
    getAiStore().upsertAiError(gameCode, playerId, message)
  );
}

function observe(game: Game): TurnObservation {
  const state = game.getState();
  const rackSizes: Record<string, number> = {};
  for (const player of state.players) {
    rackSizes[player.id] = player.rack.length;
  }
  return {
    boardTileCount: state.board.reduce((sum, set) => sum + set.tiles.length, 0),
    consecutivePasses: state.consecutivePasses,
    rackSizes,
  };
}

function diffEvents(previous: TurnObservation, state: GameState, currentPlayerId: string): string[] {
  const events: string[] = [];
  const unchanged: string[] = [];
  let boardChangedByPlay = false;
  for (const player of state.players) {
    if (player.id === currentPlayerId) {
      continue;
    }
    const before = previous.rackSizes[player.id];
    if (before === undefined) {
      continue;
    }
    const delta = player.rack.length - before;
    if (delta > 0) {
      events.push(`${player.name} drew a tile`);
    } else if (delta < 0) {
      events.push(`${player.name} made changes to the board and ended his turn`);
      boardChangedByPlay = true;
    } else {
      unchanged.push(player.name);
    }
  }
  if (state.consecutivePasses > previous.consecutivePasses) {
    events.push(
      unchanged.length === 1 ? `${unchanged[0]} passed` : `${unchanged.join(" and ")} passed`
    );
  }
  const boardTileCount = state.board.reduce((sum, set) => sum + set.tiles.length, 0);
  if (boardTileCount !== previous.boardTileCount && !boardChangedByPlay) {
    events.push("the board changed");
  }
  return events;
}

export async function maybeRunNextTurn(
  io: SocketIOServer,
  game: Game,
  gameCode: string
): Promise<void> {
  if (busyGames.has(gameCode)) {
    return;
  }
  busyGames.add(gameCode);
  try {
    while (game.getState().phase === "playing") {
      const state = game.getState();
      const currentPlayer = state.players[state.currentTurnIndex];

      let tracking = turnTracking.get(gameCode);
      if (
        (!tracking || tracking.roundNumber !== state.roundNumber) &&
        state.players.some((p) => p.isAI)
      ) {
        tracking = {
          roundNumber: state.roundNumber,
          turnNumber: 0,
          baseline: observe(game),
          observations: new Map(),
        };
        turnTracking.set(gameCode, tracking);
        persistTurnTracking(gameCode, tracking);
      }

      if (!currentPlayer?.isAI) {
        break;
      }
      if (!tracking) {
        break;
      }
      if (aiErrors.has(aiErrorKey(gameCode, currentPlayer.id))) {
        break;
      }

      const previous = tracking.observations.get(currentPlayer.id) ?? tracking.baseline;
      const events = diffEvents(previous, state, currentPlayer.id);
      const turnNumber = tracking.turnNumber + 1;
      const context: TurnContext = { turnNumber, eventsNote: events.join("; ") };

      tracking.turnNumber = turnNumber;
      persistTurnTracking(gameCode, tracking);

      const provider = getProvider(aiConfig.provider);
      const controller = new AiTurnController(io, game, gameCode, currentPlayer.id);
      try {
        await provider.takeTurn(controller, context);
      } catch (err) {
        const message = (err as Error).message || "Unknown AI error";
        aiErrors.set(aiErrorKey(gameCode, currentPlayer.id), message);
        persistAiError(gameCode, currentPlayer.id, message);
        const payload: AiErrorPayload = {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          message,
        };
        io.to(gameCode).emit("ai:error", payload);
        console.error(`AI error for ${currentPlayer.name}:`, err);
        break;
      }

      const nextPlayer = game.getState().players[game.getState().currentTurnIndex];
      if (nextPlayer.id === currentPlayer.id && game.getState().phase === "playing") {
        const message = "AI completed turn without ending it or passing";
        aiErrors.set(aiErrorKey(gameCode, currentPlayer.id), message);
        persistAiError(gameCode, currentPlayer.id, message);
        const payload: AiErrorPayload = {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          message,
        };
        io.to(gameCode).emit("ai:error", payload);
        console.error(`AI error for ${currentPlayer.name}: ${message}`);
        break;
      }

      tracking.observations.set(currentPlayer.id, observe(game));
      persistTurnTracking(gameCode, tracking);
    }
  } finally {
    busyGames.delete(gameCode);
  }
}

export async function restoreAiState(): Promise<void> {
  const store = getAiStore();
  const trackingRows = await store.loadAllTurnTracking();
  turnTracking.clear();
  for (const row of trackingRows) {
    turnTracking.set(row.gameCode, deserializeTracking(row.data));
  }
  const errorRows = await store.loadAllAiErrors();
  aiErrors.clear();
  for (const row of errorRows) {
    aiErrors.set(aiErrorKey(row.gameCode, row.playerId), row.message);
  }
}

export function unloadAiState(): void {
  turnTracking.clear();
  aiErrors.clear();
}

export function resetTurnContext(gameCode: string): void {
  turnTracking.delete(gameCode);
  queueAiWrite(`aitracking:${gameCode}`, () => getAiStore().deleteTurnTracking(gameCode));
}

export function resetAiErrors(gameCode: string): void {
  for (const key of [...aiErrors.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      aiErrors.delete(key);
    }
  }
  queueAiWrite(`aierrors:${gameCode}`, () => getAiStore().deleteGameAiErrors(gameCode));
}

export function purgeAiState(gameCode: string): void {
  resetTurnContext(gameCode);
  resetAiErrors(gameCode);
}

export async function resumePendingAiTurns(io: SocketIOServer, games: Game[]): Promise<void> {
  await Promise.all(
    games
      .filter((game) => {
        const state = game.getState();
        if (state.phase !== "playing") {
          return false;
        }
        return state.players[state.currentTurnIndex]?.isAI === true;
      })
      .map((game) => maybeRunNextTurn(io, game, game.getState().id))
  );
}

export function _resetAiRunnerState(): void {
  busyGames.clear();
  aiErrors.clear();
  turnTracking.clear();
}

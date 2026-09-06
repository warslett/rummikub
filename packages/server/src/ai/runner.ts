import type { Server as SocketIOServer } from "socket.io";
import type { Game } from "../game.js";
import type { GameState } from "@rummikub/shared";
import type { AiErrorPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import { AiTurnController } from "./controller.js";
import type { TurnContext } from "./providers/types.js";

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
  observation: TurnObservation | null;
}

const turnTracking = new Map<string, GameTurnTracking>();

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
      if (!currentPlayer?.isAI) {
        break;
      }
      if (aiErrors.has(aiErrorKey(gameCode, currentPlayer.id))) {
        break;
      }

      let tracking = turnTracking.get(gameCode);
      if (!tracking || tracking.roundNumber !== state.roundNumber) {
        tracking = { roundNumber: state.roundNumber, turnNumber: 0, observation: null };
        turnTracking.set(gameCode, tracking);
      }

      const events = tracking.observation ? diffEvents(tracking.observation, state, currentPlayer.id) : [];
      const turnNumber = tracking.turnNumber + 1;
      const context: TurnContext = { turnNumber, eventsNote: events.join("; ") };

      tracking.turnNumber = turnNumber;
      tracking.observation = observe(game);

      const provider = getProvider(aiConfig.provider);
      const controller = new AiTurnController(io, game, gameCode, currentPlayer.id);
      try {
        await provider.takeTurn(controller, context);
      } catch (err) {
        const message = (err as Error).message || "Unknown AI error";
        aiErrors.set(aiErrorKey(gameCode, currentPlayer.id), message);
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
        const payload: AiErrorPayload = {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          message,
        };
        io.to(gameCode).emit("ai:error", payload);
        console.error(`AI error for ${currentPlayer.name}: ${message}`);
        break;
      }
    }
  } finally {
    busyGames.delete(gameCode);
  }
}

export function resetTurnContext(gameCode: string): void {
  turnTracking.delete(gameCode);
}

export function resetAiErrors(gameCode: string): void {
  for (const key of [...aiErrors.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      aiErrors.delete(key);
    }
  }
}

export function _resetAiRunnerState(): void {
  busyGames.clear();
  aiErrors.clear();
  turnTracking.clear();
}

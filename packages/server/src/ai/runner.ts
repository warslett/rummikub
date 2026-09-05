import type { Server as SocketIOServer } from "socket.io";
import type { Game } from "../game.js";
import type { AiErrorPayload } from "@rummikub/shared";
import { aiConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import { AiTurnController } from "./controller.js";

const busyGames = new Set<string>();
const aiErrors = new Map<string, string>();

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
      if (aiErrors.has(currentPlayer.id)) {
        break;
      }

      const provider = getProvider(aiConfig.provider);
      const controller = new AiTurnController(io, game, gameCode, currentPlayer.id);
      try {
        await provider.takeTurn(controller);
      } catch (err) {
        const message = (err as Error).message || "Unknown AI error";
        aiErrors.set(currentPlayer.id, message);
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
        aiErrors.set(currentPlayer.id, message);
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

export function _resetAiRunnerState(): void {
  busyGames.clear();
  aiErrors.clear();
}

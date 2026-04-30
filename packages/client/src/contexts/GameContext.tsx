import { createContext, useContext } from "react";
import type { PlayerGameState, SpectatorGameState } from "@rummikub/shared";

interface GameContextValue {
  gameState: PlayerGameState | null;
  setGameState: (state: PlayerGameState | null) => void;
  playerId: string | null;
  setPlayerId: (id: string | null) => void;
  gameCode: string | null;
  setGameCode: (code: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  isSpectator: boolean;
  setIsSpectator: (spectator: boolean) => void;
  spectatorState: SpectatorGameState | null;
  setSpectatorState: (state: SpectatorGameState | null) => void;
}

export const GameContext = createContext<GameContextValue>({
  gameState: null,
  setGameState: () => {},
  playerId: null,
  setPlayerId: () => {},
  gameCode: null,
  setGameCode: () => {},
  error: null,
  setError: () => {},
  isSpectator: false,
  setIsSpectator: () => {},
  spectatorState: null,
  setSpectatorState: () => {},
});

export function useGame() {
  return useContext(GameContext);
}

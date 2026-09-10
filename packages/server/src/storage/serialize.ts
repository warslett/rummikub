import type { GameState } from "@rummikub/shared";

export function serializeGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

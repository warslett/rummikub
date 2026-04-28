import type { Color, Value } from "./constants.js";

export interface Tile {
  id: string;
  color: Color;
  value: Value;
}

export type SetType = "run" | "group";

export interface TileSet {
  id: string;
  tiles: Tile[];
}

export interface Player {
  id: string;
  name: string;
  rack: Tile[];
  hasInitialMeld: boolean;
  score: number;
  connected: boolean;
}

export type GamePhase = "lobby" | "playing" | "ended";

export interface GameState {
  id: string;
  phase: GamePhase;
  players: Player[];
  currentTurnIndex: number;
  board: TileSet[];
  pool: Tile[];
  turnActions: TurnAction[];
  createdAt: number;
  lastActivityAt: number;
}

export type TurnAction =
  | { type: "placeSet"; tiles: Tile[] }
  | { type: "draw" };

export interface PlayerGameState {
  id: string;
  phase: GamePhase;
  yourRack: Tile[];
  opponentRackSize: number;
  opponentName: string;
  yourName: string;
  board: TileSet[];
  poolSize: number;
  currentTurnPlayerId: string;
  isYourTurn: boolean;
  yourScore: number;
  opponentScore: number;
  hasInitialMeld: boolean;
}

export interface GameCreatedPayload {
  gameCode: string;
  gameUrl: string;
  playerId: string;
}

export interface GameJoinedPayload {
  playerId: string;
  opponentName: string;
}

export interface GameStartedPayload {
  gameState: PlayerGameState;
}

export interface GameStatePayload {
  gameState: PlayerGameState;
}

export interface MoveRejectedPayload {
  reason: string;
}

export interface GameEndedPayload {
  winnerId: string;
  winnerName: string;
  scores: { playerId: string; name: string; score: number; rackValue: number }[];
}

export interface PlayerDisconnectedPayload {
  playerId: string;
  playerName: string;
}

export interface PlayerReconnectedPayload {
  playerId: string;
  playerName: string;
}

export interface GameErrorPayload {
  message: string;
}

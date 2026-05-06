import type { Color, Value } from "./constants.js";

export interface Tile {
  id: string;
  color: Color | "joker";
  value: Value | 0;
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
  gamesWon: number;
}

export type GamePhase = "lobby" | "playing" | "ended";

export interface TurnSnapshot {
  board: TileSet[];
  rack: Tile[];
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: Player[];
  currentTurnIndex: number;
  board: TileSet[];
  pool: Tile[];
  turnActions: TurnAction[];
  turnSnapshot: TurnSnapshot | null;
  roundNumber: number;
  consecutivePasses: number;
  createdAt: number;
  lastActivityAt: number;
}

export type TurnAction =
  | { type: "placeSet"; tiles: Tile[] }
  | { type: "draw" }
  | { type: "manipulate" }
  | { type: "pass" };

export interface PlayerGameState {
  type: "player";
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
  hasPlayedThisTurn: boolean;
  roundNumber: number;
  yourGamesWon: number;
  opponentGamesWon: number;
  opponentConnected: boolean;
  consecutivePasses: number;
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

export interface SpectatorGameStatePayload {
  gameState: SpectatorGameState;
}

export interface MoveRejectedPayload {
  reason: string;
}

export interface GameEndedPayload {
  winnerId: string;
  winnerName: string;
  scores: { playerId: string; name: string; score: number; rackValue: number }[];
  roundNumber: number;
  isStalemate: boolean;
  gamesWon: { playerId: string; gamesWon: number }[];
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

export interface SpectatorGameState {
  type: "spectator";
  id: string;
  phase: GamePhase;
  board: TileSet[];
  poolSize: number;
  currentTurnPlayerId: string;
  players: { id: string; name: string; score: number; gamesWon: number; connected: boolean }[];
  roundNumber: number;
  consecutivePasses: number;
}

export interface SpectatorJoinedPayload {
  gameState: SpectatorGameState;
}

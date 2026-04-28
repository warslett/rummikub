import {
  INITIAL_HAND_SIZE,
  INITIAL_MELD_MINIMUM,
  isValidSet,
  calculateSetValue,
  generateAllTiles,
  shuffleTiles,
} from "@rummikub/shared";
import type { TileSet, Player, GameState, GamePhase, PlayerGameState } from "@rummikub/shared";

export interface GameEndResult {
  winnerId: string;
  winnerName: string;
  winnerScore: number;
  loserPenalty: number;
  loserId: string;
  loserName: string;
}

export class Game {
  private state: GameState;

  constructor(gameCode: string) {
    this.state = {
      id: gameCode,
      phase: "lobby",
      players: [],
      currentTurnIndex: 0,
      board: [],
      pool: [],
      turnActions: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
  }

  addPlayer(playerId: string, name: string): void {
    if (this.state.phase !== "lobby") {
      throw new Error("Cannot add players after game has started");
    }
    if (this.state.players.length >= 2) {
      throw new Error("Game is full");
    }
    if (this.state.players.some((p) => p.id === playerId)) {
      throw new Error("Player already in game");
    }
    this.state.players.push({
      id: playerId,
      name,
      rack: [],
      hasInitialMeld: false,
      score: 0,
      connected: true,
    });
  }

  start(): void {
    if (this.state.players.length < 2) {
      throw new Error("Need 2 players to start");
    }

    const allTiles = shuffleTiles(generateAllTiles());
    let index = 0;

    for (const player of this.state.players) {
      player.rack = allTiles.slice(index, index + INITIAL_HAND_SIZE);
      index += INITIAL_HAND_SIZE;
    }

    this.state.pool = allTiles.slice(index);
    this.state.currentTurnIndex = 0;
    this.state.phase = "playing";
    this.state.turnActions = [];
    this.state.lastActivityAt = Date.now();
  }

  drawTile(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    if (this.state.pool.length === 0) {
      throw new Error("Pool is empty");
    }

    const tile = this.state.pool.pop()!;
    const player = this.getPlayer(playerId);
    player.rack.push(tile);
    this.state.turnActions.push({ type: "draw" });
    this.advanceTurn();
  }

  playSets(playerId: string, sets: TileSet[]): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    const player = this.getPlayer(playerId);

    const allPlayedTiles = sets.flatMap((s) => s.tiles);
    for (const tile of allPlayedTiles) {
      if (!player.rack.some((r) => r.id === tile.id)) {
        throw new Error("Tile not in player's rack");
      }
    }

    for (const set of sets) {
      if (!isValidSet(set.tiles)) {
        throw new Error("Invalid set");
      }
    }

    player.rack = player.rack.filter((r) => !allPlayedTiles.some((t) => t.id === r.id));
    this.state.board.push(...sets);
    this.state.turnActions.push({ type: "placeSet", tiles: allPlayedTiles });
    this.state.lastActivityAt = Date.now();
  }

  endTurn(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    const player = this.getPlayer(playerId);

    if (this.state.turnActions.some((a) => a.type === "placeSet")) {
      if (!player.hasInitialMeld) {
        const cumulativeValue = this.state.turnActions
          .filter((a) => a.type === "placeSet")
          .reduce((sum, a) => sum + calculateSetValue(a.tiles), 0);
        if (cumulativeValue < INITIAL_MELD_MINIMUM) {
          throw new Error(`Initial meld must be at least ${INITIAL_MELD_MINIMUM} points`);
        }
      }
      player.hasInitialMeld = true;
    }

    this.state.turnActions = [];
    this.advanceTurn();
  }

  checkGameEnd(): { winnerId: string; winnerName: string } | null {
    for (const player of this.state.players) {
      if (player.rack.length === 0) {
        this.state.phase = "ended";
        return { winnerId: player.id, winnerName: player.name };
      }
    }
    return null;
  }

  calculateScores(): GameEndResult | null {
    const endResult = this.checkGameEnd();
    if (!endResult) return null;

    const winner = this.state.players.find((p) => p.id === endResult.winnerId)!;
    const loser = this.state.players.find((p) => p.id !== endResult.winnerId)!;

    const loserRackValue = loser.rack.reduce((sum, t) => sum + t.value, 0);

    return {
      winnerId: winner.id,
      winnerName: winner.name,
      winnerScore: loserRackValue,
      loserId: loser.id,
      loserName: loser.name,
      loserPenalty: -loserRackValue,
    };
  }

  getState(): GameState {
    return this.state;
  }

  getPlayerState(playerId: string): PlayerGameState {
    const player = this.getPlayer(playerId);
    const opponent = this.state.players.find((p) => p.id !== playerId)!;
    const currentPlayer = this.state.players[this.state.currentTurnIndex];

    return {
      id: this.state.id,
      phase: this.state.phase,
      yourRack: player.rack,
      opponentRackSize: opponent.rack.length,
      opponentName: opponent.name,
      yourName: player.name,
      board: this.state.board,
      poolSize: this.state.pool.length,
      currentTurnPlayerId: currentPlayer.id,
      isYourTurn: currentPlayer.id === playerId,
      yourScore: player.score,
      opponentScore: opponent.score,
      hasInitialMeld: player.hasInitialMeld,
    };
  }

  private requirePhase(phase: GamePhase): void {
    if (this.state.phase !== phase) {
      throw new Error(`Game must be in ${phase} phase`);
    }
  }

  private requireCurrentPlayer(playerId: string): void {
    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (currentPlayer.id !== playerId) {
      throw new Error("Not your turn");
    }
  }

  private getPlayer(playerId: string): Player {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) throw new Error("Player not found");
    return player;
  }

  private advanceTurn(): void {
    this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % this.state.players.length;
    this.state.lastActivityAt = Date.now();
  }
}

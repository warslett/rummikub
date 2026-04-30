import {
  INITIAL_HAND_SIZE,
  INITIAL_MELD_MINIMUM,
  isValidSet,
  isValidBoard,
  calculateSetValue,
  resolveJokerValue,
  generateAllTiles,
  shuffleTiles,
  JOKER_COLOR,
  JOKER_PENALTY,
} from "@rummikub/shared";
import type { TileSet, Tile, Player, GameState, GamePhase, PlayerGameState, SpectatorGameState } from "@rummikub/shared";

function isJoker(tile: Tile): boolean {
  return tile.color === JOKER_COLOR;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export interface GameEndResult {
  winnerId: string;
  winnerName: string;
  winnerScore: number;
  loserPenalty: number;
  loserId: string;
  loserName: string;
}

export interface SeedState {
  board: TileSet[];
  racks: Record<string, Tile[]>;
  pool: Tile[];
  currentTurnPlayerId: string;
  hasInitialMeld: Record<string, boolean>;
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
      turnSnapshot: null,
      roundNumber: 1,
      consecutivePasses: 0,
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
      gamesWon: 0,
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
    this.state.roundNumber = 1;
    this.state.consecutivePasses = 0;
    this.state.lastActivityAt = Date.now();
  }

  drawTile(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);
    this.ensureTurnSnapshot();

    if (this.state.pool.length === 0) {
      throw new Error("Pool is empty");
    }

    const tile = this.state.pool.pop()!;
    const player = this.getPlayer(playerId);
    player.rack.push(tile);
    this.state.turnActions.push({ type: "draw" });
    this.state.consecutivePasses = 0;
    this.advanceTurn();
  }

  playSets(playerId: string, sets: TileSet[]): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);
    this.ensureTurnSnapshot();

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

  manipulateBoard(playerId: string, newBoard: TileSet[]): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);
    this.ensureTurnSnapshot();

    const player = this.getPlayer(playerId);

    if (!player.hasInitialMeld) {
      throw new Error("Cannot manipulate board before making initial meld");
    }

    if (!isValidBoard(newBoard)) {
      throw new Error("Resulting board has invalid sets");
    }

    const oldBoardTileIds = new Set(this.state.board.flatMap((s) => s.tiles.map((t) => t.id)));
    const oldRackTileIds = new Set(player.rack.map((t) => t.id));
    const newBoardTileIds = newBoard.flatMap((s) => s.tiles.map((t) => t.id));

    for (const tileId of newBoardTileIds) {
      if (!oldBoardTileIds.has(tileId) && !oldRackTileIds.has(tileId)) {
        throw new Error("Tile on new board was not available");
      }
    }

    const newBoardTileIdSet = new Set(newBoardTileIds);
    if (newBoardTileIdSet.size !== newBoardTileIds.length) {
      throw new Error("Duplicate tiles on board");
    }

    const jokersOnOldBoard = this.state.board.flatMap((s) => s.tiles).filter(isJoker);
    const jokersOnNewBoard = newBoard.flatMap((s) => s.tiles).filter(isJoker);

    const freedJokers = jokersOnOldBoard.filter((j) => !newBoardTileIdSet.has(j.id));
    if (freedJokers.length > 0) {
      const usedJokerIds = new Set(jokersOnNewBoard.map((t) => t.id));
      for (const freedJoker of freedJokers) {
        if (!usedJokerIds.has(freedJoker.id)) {
          throw new Error("Freed joker must be used in the same turn");
        }
      }
    }

    const jokerRetrieved = this.wasJokerRetrieved(this.state.board, newBoard);
    if (jokerRetrieved) {
      const rackTilesOnNewBoard = newBoardTileIds.filter((id) => !oldBoardTileIds.has(id));
      if (rackTilesOnNewBoard.length === 0) {
        throw new Error("Must play at least one rack tile when retrieving a joker");
      }
    }

    const newRack: Tile[] = [];
    for (const tile of player.rack) {
      if (!newBoardTileIdSet.has(tile.id)) {
        newRack.push(tile);
      }
    }

    const returnedBoardTiles: Tile[] = [];
    for (const set of this.state.board) {
      for (const tile of set.tiles) {
        if (!newBoardTileIdSet.has(tile.id) && !oldRackTileIds.has(tile.id)) {
          returnedBoardTiles.push(tile);
        }
      }
    }

    player.rack = [...newRack, ...returnedBoardTiles];
    this.state.board = newBoard;
    this.state.turnActions.push({ type: "manipulate" });
    this.state.lastActivityAt = Date.now();
  }

  undoTurn(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    const snapshot = this.state.turnSnapshot;
    if (!snapshot) {
      throw new Error("No turn snapshot to undo");
    }

    this.state.board = deepClone(snapshot.board);
    const player = this.getPlayer(playerId);
    player.rack = deepClone(snapshot.rack);
    this.state.turnActions = [];
    this.state.lastActivityAt = Date.now();
  }

  endTurn(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    if (this.state.turnActions.length === 0) {
      throw new Error("Must play or draw before ending turn");
    }

    const player = this.getPlayer(playerId);

    if (this.state.turnActions.some((a) => a.type === "placeSet" || a.type === "manipulate")) {
      if (!player.hasInitialMeld) {
        if (this.state.turnActions.some((a) => a.type === "manipulate")) {
          throw new Error("Cannot manipulate board before making initial meld");
        }

        const placeSetActions = this.state.turnActions.filter((a) => a.type === "placeSet");
        const cumulativeValue = placeSetActions.reduce((sum, a) => {
          const tiles = a.type === "placeSet" ? a.tiles : [];
          return sum + calculateSetValue(tiles);
        }, 0);
        if (cumulativeValue < INITIAL_MELD_MINIMUM) {
          throw new Error(`Initial meld must be at least ${INITIAL_MELD_MINIMUM} points`);
        }
      }
      player.hasInitialMeld = true;
      this.state.consecutivePasses = 0;
    }

    this.state.turnActions = [];
    this.advanceTurn();
  }

  endTurnWithBoard(playerId: string, newBoard?: TileSet[]): void {
    if (newBoard) {
      this.manipulateBoard(playerId, newBoard);
    }
    this.endTurn(playerId);
  }

  passTurn(playerId: string): void {
    this.requirePhase("playing");
    this.requireCurrentPlayer(playerId);

    if (this.state.pool.length > 0) {
      throw new Error("Can only pass when pool is empty");
    }

    if (this.state.turnActions.some((a) => a.type === "placeSet" || a.type === "manipulate")) {
      throw new Error("Cannot pass after making a play this turn");
    }

    this.state.turnActions.push({ type: "pass" });
    this.state.consecutivePasses++;
    this.state.turnActions = [];

    if (this.state.consecutivePasses >= 2) {
      this.endGameStalemate();
      return;
    }

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

    const loserRackValue = this.calculateRackValue(loser);

    return {
      winnerId: winner.id,
      winnerName: winner.name,
      winnerScore: loserRackValue,
      loserId: loser.id,
      loserName: loser.name,
      loserPenalty: -loserRackValue,
    };
  }

  calculateStalemateScores(): GameEndResult | null {
    const values = this.state.players.map((p) => ({
      player: p,
      rackValue: this.calculateRackValue(p),
    }));

    const minValue = Math.min(...values.map((v) => v.rackValue));
    const maxValue = Math.max(...values.map((v) => v.rackValue));

    if (minValue === maxValue) return null;

    const winner = values.find((v) => v.rackValue === minValue)!.player;
    const loser = values.find((v) => v.rackValue !== minValue)!.player;
    const loserRackValue = values.find((v) => v.rackValue !== minValue)!.rackValue;
    const winnerRackValue = minValue;

    return {
      winnerId: winner.id,
      winnerName: winner.name,
      winnerScore: loserRackValue - winnerRackValue,
      loserId: loser.id,
      loserName: loser.name,
      loserPenalty: winnerRackValue - loserRackValue,
    };
  }

  applyScores(result: GameEndResult): void {
    const winner = this.state.players.find((p) => p.id === result.winnerId);
    const loser = this.state.players.find((p) => p.id === result.loserId);
    if (winner) winner.score += result.winnerScore;
    if (loser) loser.score += result.loserPenalty;
  }

  applyStalemateScores(result: GameEndResult): void {
    this.applyScores(result);
  }

  getRackValue(playerId: string): number {
    const player = this.getPlayer(playerId);
    return this.calculateRackValue(player);
  }

  private calculateRackValue(player: Player): number {
    return player.rack.reduce((sum, t) => {
      if (isJoker(t)) return sum + JOKER_PENALTY;
      return sum + (t.value as number);
    }, 0);
  }

  startNewRound(): void {
    if (this.state.phase !== "ended") {
      throw new Error("Can only start new round after game has ended");
    }

    const preservedScores = this.state.players.map((p) => ({ id: p.id, score: p.score, gamesWon: p.gamesWon }));

    const allTiles = shuffleTiles(generateAllTiles());
    let index = 0;

    for (const player of this.state.players) {
      player.rack = allTiles.slice(index, index + INITIAL_HAND_SIZE);
      player.hasInitialMeld = false;
      index += INITIAL_HAND_SIZE;
    }

    this.state.pool = allTiles.slice(index);
    this.state.board = [];
    this.state.turnActions = [];
    this.state.currentTurnIndex = 0;
    this.state.phase = "playing";
    this.state.roundNumber++;
    this.state.consecutivePasses = 0;
    this.state.lastActivityAt = Date.now();
  }

  reconnectPlayer(playerId: string): void {
    const player = this.getPlayer(playerId);
    player.connected = true;
  }

  seedGame(seed: SeedState): void {
    this.state.phase = "playing";
    this.state.board = deepClone(seed.board);
    this.state.pool = deepClone(seed.pool);
    this.state.turnActions = [];
    this.state.turnSnapshot = null;
    this.state.consecutivePasses = 0;

    for (const player of this.state.players) {
      player.rack = deepClone(seed.racks[player.id] ?? []);
      player.hasInitialMeld = seed.hasInitialMeld[player.id] ?? false;
    }

    const turnIndex = this.state.players.findIndex((p) => p.id === seed.currentTurnPlayerId);
    this.state.currentTurnIndex = turnIndex >= 0 ? turnIndex : 0;
    this.state.lastActivityAt = Date.now();
  }

  getState(): GameState {
    return this.state;
  }

  getPlayerState(playerId: string): PlayerGameState {
    console.debug(`[getPlayerState] playerId=${playerId} players=${this.state.players.length} playerIds=[${this.state.players.map(p => p.id).join(",")}]`);
    const player = this.getPlayer(playerId);
    const opponent = this.state.players.find((p) => p.id !== playerId);
    if (!opponent) {
      console.error(`[getPlayerState] CRASH IMMINENT: No opponent found for playerId=${playerId}! players=${this.state.players.length} playerIds=[${this.state.players.map(p => p.id).join(",")}]`);
    }
    const opponentAsserted = opponent!;
    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    const hasPlayedThisTurn = currentPlayer.id === playerId && this.state.turnActions.length > 0;

    return {
      id: this.state.id,
      phase: this.state.phase,
      yourRack: player.rack,
      opponentRackSize: opponentAsserted.rack.length,
      opponentName: opponentAsserted.name,
      yourName: player.name,
      board: this.state.board,
      poolSize: this.state.pool.length,
      currentTurnPlayerId: currentPlayer.id,
      isYourTurn: currentPlayer.id === playerId,
      yourScore: player.score,
      opponentScore: opponentAsserted.score,
      hasInitialMeld: player.hasInitialMeld,
      hasPlayedThisTurn,
      roundNumber: this.state.roundNumber,
      yourGamesWon: player.gamesWon,
      opponentGamesWon: opponentAsserted.gamesWon,
      opponentConnected: opponentAsserted.connected,
      consecutivePasses: this.state.consecutivePasses,
    };
  }

  getSpectatorState(): SpectatorGameState {
    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    return {
      id: this.state.id,
      phase: this.state.phase,
      board: this.state.board,
      poolSize: this.state.pool.length,
      currentTurnPlayerId: currentPlayer.id,
      players: this.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        rackSize: p.rack.length,
        score: p.score,
        gamesWon: p.gamesWon,
        connected: p.connected,
      })),
      roundNumber: this.state.roundNumber,
      consecutivePasses: this.state.consecutivePasses,
    };
  }

  private endGameStalemate(): void {
    this.state.phase = "ended";
  }

  private wasJokerRetrieved(oldBoard: TileSet[], newBoard: TileSet[]): boolean {
    const oldJokerSets = new Map<string, Set<string>>();
    for (const set of oldBoard) {
      for (const tile of set.tiles) {
        if (isJoker(tile)) {
          const siblingIds = set.tiles.filter((t) => t.id !== tile.id).map((t) => t.id);
          oldJokerSets.set(tile.id, new Set(siblingIds));
        }
      }
    }

    const newJokerSets = new Map<string, Set<string>>();
    for (const set of newBoard) {
      for (const tile of set.tiles) {
        if (isJoker(tile)) {
          const siblingIds = set.tiles.filter((t) => t.id !== tile.id).map((t) => t.id);
          newJokerSets.set(tile.id, new Set(siblingIds));
        }
      }
    }

    for (const [jokerId, oldSiblings] of oldJokerSets) {
      const newSiblings = newJokerSets.get(jokerId);
      if (!newSiblings) return true;
      if (oldSiblings.size !== newSiblings.size) return true;
      for (const id of oldSiblings) {
        if (!newSiblings.has(id)) return true;
      }
    }

    return false;
  }

  private ensureTurnSnapshot(): void {
    if (this.state.turnSnapshot) return;
    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    this.state.turnSnapshot = {
      board: deepClone(this.state.board),
      rack: deepClone(currentPlayer.rack),
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
    this.state.turnActions = [];
    this.state.turnSnapshot = null;
  }
}

import type { Server as SocketIOServer } from "socket.io";
import type { TileSet, PlayerGameState } from "@rummikub/shared";
import { Game } from "../game.js";
import { emitPlayerStates, emitGameEnded, emitStalemateEnded } from "../emissions.js";

export type ControllerResult =
  | { ok: true; state: PlayerGameState }
  | { ok: false; error: string };

export class AiTurnController {
  constructor(
    private readonly io: SocketIOServer,
    private readonly game: Game,
    private readonly gameCode: string,
    private readonly playerId: string
  ) {}

  getGame(): Game {
    return this.game;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getMyState(): { ok: true; state: PlayerGameState } {
    return { ok: true, state: this.game.getPlayerState(this.playerId) };
  }

  playSets(sets: TileSet[]): ControllerResult {
    try {
      this.game.playSets(this.playerId, sets);
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  manipulateBoard(newBoard: TileSet[]): ControllerResult {
    try {
      this.game.manipulateBoard(this.playerId, newBoard);
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  undoTurn(): ControllerResult {
    try {
      this.game.undoTurn(this.playerId);
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  drawTile(): ControllerResult {
    try {
      this.game.drawTile(this.playerId);
      const endResult = this.game.checkGameEnd();
      if (endResult) {
        emitGameEnded(this.io, this.game, this.gameCode, endResult);
      } else {
        emitPlayerStates(this.io, this.game, this.gameCode);
      }
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  endTurn(newBoard?: TileSet[]): ControllerResult {
    try {
      this.game.endTurnWithBoard(this.playerId, newBoard);
      const endResult = this.game.checkGameEnd();
      if (endResult) {
        emitGameEnded(this.io, this.game, this.gameCode, endResult);
      } else {
        emitPlayerStates(this.io, this.game, this.gameCode);
      }
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  passTurn(): ControllerResult {
    try {
      this.game.passTurn(this.playerId);
      const state = this.game.getState();
      if (state.phase === "ended") {
        emitStalemateEnded(this.io, this.game, this.gameCode);
      } else {
        emitPlayerStates(this.io, this.game, this.gameCode);
      }
      return { ok: true, state: this.game.getPlayerState(this.playerId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

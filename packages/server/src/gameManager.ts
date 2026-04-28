import { GAME_CODE_CHARS, GAME_CODE_LENGTH } from "@rummikub/shared";
import { Game } from "./game.js";

export class GameManager {
  private games = new Map<string, Game>();

  createGame(): { gameCode: string } {
    let code: string;
    do {
      code = this.generateGameCode();
    } while (this.games.has(code));

    const game = new Game(code);
    this.games.set(code, game);
    return { gameCode: code };
  }

  getGame(gameCode: string): Game | undefined {
    return this.games.get(gameCode);
  }

  gameCodeExists(gameCode: string): boolean {
    return this.games.has(gameCode);
  }

  private generateGameCode(): string {
    let code = "";
    for (let i = 0; i < GAME_CODE_LENGTH; i++) {
      const index = Math.floor(Math.random() * GAME_CODE_CHARS.length);
      code += GAME_CODE_CHARS[index];
    }
    return code;
  }
}

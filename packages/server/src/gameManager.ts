import { GAME_CODE_CHARS, GAME_CODE_LENGTH } from "@rummikub/shared";
import { Game } from "./game.js";
import { purgeGame } from "./ai/providers/llm.js";
import { purgeGame as purgeDebugTranscripts } from "./ai/debug.js";
import { resetTurnContext } from "./ai/runner.js";

const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class GameManager {
  private games = new Map<string, Game>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

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

  cleanupExpiredGames(): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, game] of this.games) {
      if (now - game.getState().lastActivityAt > INACTIVITY_TIMEOUT_MS) {
        this.games.delete(code);
        purgeGame(code);
        purgeDebugTranscripts(code);
        resetTurnContext(code);
        removed++;
      }
    }
    return removed;
  }

  startCleanup(intervalMs: number = 10 * 60 * 1000): void {
    this.cleanupInterval = setInterval(() => this.cleanupExpiredGames(), intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
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

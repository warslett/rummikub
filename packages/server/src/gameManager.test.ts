import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameManager } from "./gameManager";
import { GAME_CODE_LENGTH, GAME_CODE_CHARS } from "@rummikub/shared";
import * as llmModule from "./ai/providers/llm.js";
import * as runnerModule from "./ai/runner.js";

describe("GameManager", () => {
  let manager: GameManager;

  beforeEach(() => {
    manager = new GameManager();
  });

  describe("createGame", () => {
    it("should return a game code", () => {
      const result = manager.createGame();
      expect(result.gameCode).toBeDefined();
      expect(result.gameCode.length).toBe(GAME_CODE_LENGTH);
    });

    it("should generate unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(manager.createGame().gameCode);
      }
      expect(codes.size).toBe(50);
    });

    it("should only use characters from GAME_CODE_CHARS", () => {
      for (let i = 0; i < 20; i++) {
        const code = manager.createGame().gameCode;
        for (const ch of code) {
          expect(GAME_CODE_CHARS).toContain(ch);
        }
      }
    });
  });

  describe("getGame", () => {
    it("should return the game by code", () => {
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode);
      expect(game).not.toBeNull();
      expect(game!.getState().id).toBe(gameCode);
    });

    it("should return undefined for invalid code", () => {
      expect(manager.getGame("INVALID")).toBeUndefined();
    });
  });

  describe("gameCodeExists", () => {
    it("should return true for existing code", () => {
      const { gameCode } = manager.createGame();
      expect(manager.gameCodeExists(gameCode)).toBe(true);
    });

    it("should return false for non-existing code", () => {
      expect(manager.gameCodeExists("NOPE")).toBe(false);
    });
  });

  describe("multiple games", () => {
    it("should manage multiple games independently", () => {
      const g1 = manager.createGame();
      const g2 = manager.createGame();
      expect(g1.gameCode).not.toBe(g2.gameCode);

      const game1 = manager.getGame(g1.gameCode);
      const game2 = manager.getGame(g2.gameCode);
      expect(game1).not.toBe(game2);
    });
  });

  describe("cleanupExpiredGames", () => {
    it("should purge AI conversations and turn tracking for expired games", () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        const { gameCode } = manager.createGame();
        const stale = manager.createGame();
        const game = manager.getGame(stale.gameCode)!;
        game.getState().lastActivityAt = now - 25 * 60 * 60 * 1000;

        const purgeGameSpy = vi.spyOn(llmModule, "purgeGame").mockImplementation(() => {});
        const resetTurnContextSpy = vi.spyOn(runnerModule, "resetTurnContext").mockImplementation(() => {});

        const removed = manager.cleanupExpiredGames();

        expect(removed).toBe(1);
        expect(manager.getGame(stale.gameCode)).toBeUndefined();
        expect(manager.getGame(gameCode)).toBeDefined();
        expect(purgeGameSpy).toHaveBeenCalledWith(stale.gameCode);
        expect(resetTurnContextSpy).toHaveBeenCalledWith(stale.gameCode);
        expect(purgeGameSpy).not.toHaveBeenCalledWith(gameCode);
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import { INITIAL_HAND_SIZE, INITIAL_MELD_MINIMUM, TOTAL_NUMBERED_TILES } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";

function makeTile(color: Tile["color"], value: number, id?: string): Tile {
  return { id: id ?? `${color}-${value}-a`, color, value: value as Tile["value"] };
}

function makeRun(color: Tile["color"], start: number, length: number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < length; i++) {
    const v = start + i;
    const suffix = i === 0 ? "a" : "b";
    tiles.push(makeTile(color, v, `${color}-${v}-${suffix}`));
  }
  return tiles;
}

describe("Game", () => {
  let game: Game;

  beforeEach(() => {
    game = new Game("TEST01");
    game.addPlayer("p1", "Alice");
    game.addPlayer("p2", "Bob");
  });

  describe("constructor", () => {
    it("should start in lobby phase", () => {
      const fresh = new Game("TEST01");
      expect(fresh.getState().phase).toBe("lobby");
    });
  });

  describe("addPlayer", () => {
    it("should add a player", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      expect(fresh.getState().players).toHaveLength(1);
      expect(fresh.getState().players[0].name).toBe("Alice");
    });

    it("should reject adding more than 2 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      expect(() => fresh.addPlayer("p3", "Charlie")).toThrow();
    });

    it("should reject duplicate player IDs", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      expect(() => fresh.addPlayer("p1", "Alice2")).toThrow();
    });
  });

  describe("start", () => {
    it("should transition to playing phase", () => {
      game.start();
      expect(game.getState().phase).toBe("playing");
    });

    it("should deal 14 tiles to each player", () => {
      game.start();
      for (const player of game.getState().players) {
        expect(player.rack).toHaveLength(INITIAL_HAND_SIZE);
      }
    });

    it("should leave remaining tiles in the pool", () => {
      game.start();
      const dealt = INITIAL_HAND_SIZE * 2;
      expect(game.getState().pool).toHaveLength(TOTAL_NUMBERED_TILES - dealt);
    });

    it("should set currentTurnIndex to 0", () => {
      game.start();
      expect(game.getState().currentTurnIndex).toBe(0);
    });

    it("should require 2 players to start", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      expect(() => fresh.start()).toThrow();
    });
  });

  describe("drawTile", () => {
    beforeEach(() => {
      game.start();
    });

    it("should add a tile to the player rack", () => {
      const player = game.getState().players[0];
      const rackSizeBefore = player.rack.length;
      game.drawTile("p1");
      expect(game.getState().players[0].rack).toHaveLength(rackSizeBefore + 1);
    });

    it("should remove a tile from the pool", () => {
      const poolSizeBefore = game.getState().pool.length;
      game.drawTile("p1");
      expect(game.getState().pool).toHaveLength(poolSizeBefore - 1);
    });

    it("should advance the turn", () => {
      game.drawTile("p1");
      expect(game.getState().currentTurnIndex).toBe(1);
    });

    it("should reject if not the current player's turn", () => {
      expect(() => game.drawTile("p2")).toThrow();
    });

    it("should reject when pool is empty", () => {
      const state = game.getState();
      while (state.pool.length > 0) {
        game.drawTile(game.getState().players[game.getState().currentTurnIndex].id);
      }
      expect(() => game.drawTile(game.getState().players[game.getState().currentTurnIndex].id)).toThrow();
    });

    it("should reject if game is not in playing phase", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      expect(() => fresh.drawTile("p1")).toThrow();
    });
  });

  describe("playSets", () => {
    beforeEach(() => {
      game.start();
      const state = game.getState();
      state.players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
        makeTile("blue", 7, "b7a"),
        makeTile("blue", 8, "b8a"),
        makeTile("blue", 9, "b9a"),
        makeTile("black", 3, "bk3a"),
        makeTile("orange", 3, "o3a"),
        makeTile("red", 3, "r3a"),
        makeTile("black", 5, "bk5a"),
        makeTile("orange", 5, "o5a"),
        makeTile("blue", 5, "b5a"),
        makeTile("red", 1, "r1a"),
        makeTile("red", 2, "r2a"),
      ];
    });

    it("should place valid sets on the board and remove tiles from rack", () => {
      const sets: TileSet[] = [{ id: "set-1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }];
      const rackSizeBefore = game.getState().players[0].rack.length;
      game.playSets("p1", sets);
      expect(game.getState().board).toHaveLength(1);
      expect(game.getState().players[0].rack).toHaveLength(rackSizeBefore - 3);
    });

    it("should reject if not the current player's turn", () => {
      const sets: TileSet[] = [{ id: "set-1", tiles: makeRun("red", 3, 3) }];
      expect(() => game.playSets("p2", sets)).toThrow();
    });

    it("should reject if tiles are not from the player's rack", () => {
      const fakeTiles = makeRun("blue", 5, 3);
      const sets: TileSet[] = [{ id: "set-1", tiles: fakeTiles }];
      expect(() => game.playSets("p1", sets)).toThrow();
    });

    it("should reject if any set is invalid", () => {
      const invalidTiles = [makeTile("red", 10, "r10a"), makeTile("blue", 7, "b7a"), makeTile("black", 3, "bk3a")];
      const sets: TileSet[] = [{ id: "set-1", tiles: invalidTiles }];
      expect(() => game.playSets("p1", sets)).toThrow();
    });

    it("should enforce initial meld minimum of 30 points at endTurn", () => {
      expect(game.getState().players[0].hasInitialMeld).toBe(false);
      const lowSet: TileSet[] = [{ id: "set-1", tiles: [makeTile("black", 3, "bk3a"), makeTile("orange", 3, "o3a"), makeTile("red", 3, "r3a")] }];
      const totalValue = 3 + 3 + 3;
      if (totalValue < INITIAL_MELD_MINIMUM) {
        game.playSets("p1", lowSet);
        expect(() => game.endTurn("p1")).toThrow(/initial meld/i);
      }
    });

    it("should allow initial meld with 30+ points", () => {
      const highSet: TileSet[] = [{ id: "set-1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }];
      expect(() => game.playSets("p1", highSet)).not.toThrow();
    });

    it("should allow cumulative initial meld across multiple plays in same turn", () => {
      game.getState().players[0].rack = [
        makeTile("red", 8, "r8a"),
        makeTile("red", 9, "r9a"),
        makeTile("red", 10, "r10a"),
        makeTile("black", 1, "bk1a"),
        makeTile("orange", 1, "o1a"),
        makeTile("red", 1, "r1a"),
      ];
      const firstSet: TileSet[] = [{ id: "set-1", tiles: [makeTile("red", 8, "r8a"), makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a")] }];
      expect(() => game.playSets("p1", firstSet)).not.toThrow();

      const secondSet: TileSet[] = [{ id: "set-2", tiles: [makeTile("black", 1, "bk1a"), makeTile("orange", 1, "o1a"), makeTile("red", 1, "r1a")] }];
      expect(() => game.playSets("p1", secondSet)).not.toThrow();
      expect(game.getState().board).toHaveLength(2);
      expect(game.getState().players[0].hasInitialMeld).toBe(false);
    });

    it("should still reject initial meld below minimum at endTurn when cumulative turn value is under 30", () => {
      game.getState().players[0].rack = [
        makeTile("black", 3, "bk3a"),
        makeTile("orange", 3, "o3a"),
        makeTile("red", 3, "r3a"),
      ];
      const lowSet: TileSet[] = [{ id: "set-1", tiles: [makeTile("black", 3, "bk3a"), makeTile("orange", 3, "o3a"), makeTile("red", 3, "r3a")] }];
      game.playSets("p1", lowSet);
      expect(() => game.endTurn("p1")).toThrow(/initial meld/i);
    });

    it("should reject if game is not in playing phase", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      const sets: TileSet[] = [{ id: "set-1", tiles: makeRun("red", 3, 3) }];
      expect(() => fresh.playSets("p1", sets)).toThrow();
    });
  });

  describe("endTurn", () => {
    beforeEach(() => {
      game.start();
    });

    it("should advance the turn", () => {
      game.endTurn("p1");
      expect(game.getState().currentTurnIndex).toBe(1);
    });

    it("should reject if not the current player's turn", () => {
      expect(() => game.endTurn("p2")).toThrow();
    });

    it("should mark initial meld as complete after player plays a valid initial set", () => {
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
        makeTile("blue", 1, "b1a"),
      ];
      const sets: TileSet[] = [{ id: "set-1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }];
      game.playSets("p1", sets);
      game.endTurn("p1");
      expect(game.getState().players[0].hasInitialMeld).toBe(true);
    });
  });

  describe("game end", () => {
    it("should end when a player empties their rack", () => {
      game.start();
      const player = game.getState().players[0];
      player.rack = [];

      const result = game.checkGameEnd();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
    });

    it("should not end when both players have tiles", () => {
      game.start();
      const result = game.checkGameEnd();
      expect(result).toBeNull();
    });
  });

  describe("scoring", () => {
    it("should calculate scores correctly on game end", () => {
      game.start();

      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [];
      p2.rack = [makeTile("red", 5), makeTile("blue", 3)];

      const result = game.calculateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe(8);
      expect(result!.loserPenalty).toBe(-8);
    });
  });

  describe("getPlayerState", () => {
    it("should return own rack but only opponent rack size", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.yourRack).toHaveLength(INITIAL_HAND_SIZE);
      expect(state.opponentRackSize).toBe(INITIAL_HAND_SIZE);
    });

    it("should indicate whose turn it is", () => {
      game.start();
      const p1State = game.getPlayerState("p1");
      expect(p1State.isYourTurn).toBe(true);
      const p2State = game.getPlayerState("p2");
      expect(p2State.isYourTurn).toBe(false);
    });
  });
});

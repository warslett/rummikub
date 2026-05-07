import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "./game";
import { INITIAL_HAND_SIZE, INITIAL_MELD_MINIMUM, TOTAL_TILES, JOKER_PENALTY } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";

function makeTile(color: Tile["color"], value: number, id?: string): Tile {
  return { id: id ?? `${color}-${value}-a`, color, value: value as Tile["value"] };
}

function joker(id: string): Tile {
  return { id, color: "joker", value: 0 };
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

    it("should reject adding more than MAX_PLAYERS players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      expect(() => fresh.addPlayer("p5", "Eve")).toThrow();
    });

    it("should reject duplicate player IDs", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      expect(() => fresh.addPlayer("p1", "Alice2")).toThrow();
    });

    it("should accept up to MAX_PLAYERS players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      expect(fresh.getState().players).toHaveLength(4);
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
      const dealt = INITIAL_HAND_SIZE * game.getState().players.length;
      expect(game.getState().pool).toHaveLength(TOTAL_TILES - dealt);
    });

    it("should set currentTurnIndex to 0", () => {
      game.start();
      expect(game.getState().currentTurnIndex).toBe(0);
    });

    it("should require MIN_PLAYERS to start", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      expect(() => fresh.start()).toThrow();
    });

    it("should work with 3 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      expect(() => fresh.start()).not.toThrow();
      expect(fresh.getState().pool).toHaveLength(TOTAL_TILES - INITIAL_HAND_SIZE * 3);
    });

    it("should work with 4 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      expect(() => fresh.start()).not.toThrow();
      expect(fresh.getState().pool).toHaveLength(TOTAL_TILES - INITIAL_HAND_SIZE * 4);
    });

    it("should initialize roundNumber to 1", () => {
      game.start();
      expect(game.getState().roundNumber).toBe(1);
    });

    it("should initialize consecutivePasses to 0", () => {
      game.start();
      expect(game.getState().consecutivePasses).toBe(0);
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
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");
      expect(game.getState().currentTurnIndex).toBe(1);
    });

    it("should reject endTurn when no actions were taken this turn", () => {
      expect(() => game.endTurn("p1")).toThrow();
    });

    it("should reject endTurn after undo clears all actions", () => {
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.undoTurn("p1");
      expect(() => game.endTurn("p1")).toThrow();
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

    it("should create turn snapshot on first action", () => {
      game.getState().players[0].rack = [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      expect(game.getState().turnSnapshot).not.toBeNull();
      game.endTurn("p1");
      game.drawTile("p2");
      expect(game.getState().turnSnapshot).toBeNull();
    });

    it("should reset consecutivePasses when a play was made", () => {
      game.getState().consecutivePasses = 1;
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");
      expect(game.getState().consecutivePasses).toBe(0);
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
    it("should calculate scores correctly on game end with 2 players", () => {
      game.start();

      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [];
      p2.rack = [makeTile("red", 5), makeTile("blue", 3)];

      const result = game.calculateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe(8);
      expect(result!.losers).toHaveLength(1);
      expect(result!.losers[0].penalty).toBe(-8);
      expect(result!.losers[0].id).toBe("p2");
    });

    it("should calculate scores correctly with 3 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      const p1 = fresh.getState().players[0];
      const p2 = fresh.getState().players[1];
      const p3 = fresh.getState().players[2];
      p1.rack = [];
      p2.rack = [makeTile("red", 5), makeTile("blue", 3)];
      p3.rack = [makeTile("black", 7), makeTile("orange", 8)];

      const result = fresh.calculateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe(8 + 15);
      expect(result!.losers).toHaveLength(2);
      expect(result!.losers.find((l) => l.id === "p2")!.penalty).toBe(-8);
      expect(result!.losers.find((l) => l.id === "p3")!.penalty).toBe(-15);
    });

    it("should calculate scores correctly with 4 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      fresh.start();

      const p1 = fresh.getState().players[0];
      const p2 = fresh.getState().players[1];
      const p3 = fresh.getState().players[2];
      const p4 = fresh.getState().players[3];
      p1.rack = [];
      p2.rack = [makeTile("red", 10)];
      p3.rack = [makeTile("blue", 20)];
      p4.rack = [makeTile("black", 30)];

      const result = fresh.calculateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe(10 + 20 + 30);
      expect(result!.losers).toHaveLength(3);
      expect(result!.losers.find((l) => l.id === "p2")!.penalty).toBe(-10);
      expect(result!.losers.find((l) => l.id === "p3")!.penalty).toBe(-20);
      expect(result!.losers.find((l) => l.id === "p4")!.penalty).toBe(-30);
    });

    it("should apply joker penalty of 30 points in scoring", () => {
      game.start();
      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [];
      p2.rack = [joker("joker-1"), makeTile("red", 5)];

      const result = game.calculateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerScore).toBe(JOKER_PENALTY + 5);
      expect(result!.losers[0].penalty).toBe(-(JOKER_PENALTY + 5));
    });

    it("should calculate stalemate scores correctly with 2 players", () => {
      game.start();
      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [makeTile("red", 3), makeTile("blue", 3)];
      p2.rack = [makeTile("red", 10), makeTile("blue", 10)];

      const result = game.calculateStalemateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe(14);
      expect(result!.losers[0].penalty).toBe(-14);
    });

    it("should calculate stalemate scores correctly with 3 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      fresh.getState().players[0].rack = [makeTile("red", 5)];
      fresh.getState().players[1].rack = [makeTile("red", 10), makeTile("blue", 10)];
      fresh.getState().players[2].rack = [makeTile("black", 7), makeTile("orange", 8)];

      const result = fresh.calculateStalemateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe((20 - 5) + (15 - 5));
      expect(result!.losers).toHaveLength(2);
      expect(result!.losers.find((l) => l.id === "p2")!.penalty).toBe(5 - 20);
      expect(result!.losers.find((l) => l.id === "p3")!.penalty).toBe(5 - 15);
    });

    it("should calculate stalemate scores correctly with 4 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      fresh.start();

      fresh.getState().players[0].rack = [makeTile("red", 5)];
      fresh.getState().players[1].rack = [makeTile("red", 10)];
      fresh.getState().players[2].rack = [makeTile("black", 20)];
      fresh.getState().players[3].rack = [makeTile("orange", 30)];

      const result = fresh.calculateStalemateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.winnerScore).toBe((10 - 5) + (20 - 5) + (30 - 5));
      expect(result!.losers).toHaveLength(3);
      expect(result!.losers.find((l) => l.id === "p2")!.penalty).toBe(5 - 10);
      expect(result!.losers.find((l) => l.id === "p3")!.penalty).toBe(5 - 20);
      expect(result!.losers.find((l) => l.id === "p4")!.penalty).toBe(5 - 30);
    });

    it("should use joker penalty in stalemate scoring", () => {
      game.start();
      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [makeTile("red", 3)];
      p2.rack = [joker("joker-1")];

      const result = game.calculateStalemateScores();
      expect(result).not.toBeNull();
      expect(result!.winnerId).toBe("p1");
      expect(result!.losers[0].penalty).toBe(3 - JOKER_PENALTY);
      expect(result!.winnerScore).toBe(-(3 - JOKER_PENALTY));
    });

    it("should handle stalemate with tied rack values", () => {
      game.start();
      const p1 = game.getState().players[0];
      const p2 = game.getState().players[1];
      p1.rack = [makeTile("red", 5)];
      p2.rack = [makeTile("blue", 5)];

      const result = game.calculateStalemateScores();
      expect(result).toBeNull();
    });

    it("should handle stalemate with tied lowest rack values among multiple players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      fresh.getState().players[0].rack = [makeTile("red", 5)];
      fresh.getState().players[1].rack = [makeTile("blue", 5)];
      fresh.getState().players[2].rack = [makeTile("black", 10)];

      const result = fresh.calculateStalemateScores();
      expect(result).toBeNull();
    });

    it("should apply scores correctly to multiple losers", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      fresh.getState().players[0].rack = [];
      fresh.getState().players[1].rack = [makeTile("red", 10)];
      fresh.getState().players[2].rack = [makeTile("blue", 5)];

      const result = fresh.calculateScores()!;
      fresh.applyScores(result);

      expect(fresh.getState().players[0].score).toBe(15);
      expect(fresh.getState().players[1].score).toBe(-10);
      expect(fresh.getState().players[2].score).toBe(-5);
    });
  });

  describe("getPlayerState", () => {
    it("should return own rack and opponents array", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.type).toBe("player");
      expect(state.yourRack).toHaveLength(INITIAL_HAND_SIZE);
      expect(state.opponents).toHaveLength(1);
      expect(state.opponents[0].rackSize).toBe(INITIAL_HAND_SIZE);
      expect(state.opponents[0].name).toBe("Bob");
    });

    it("should indicate whose turn it is", () => {
      game.start();
      const p1State = game.getPlayerState("p1");
      expect(p1State.isYourTurn).toBe(true);
      const p2State = game.getPlayerState("p2");
      expect(p2State.isYourTurn).toBe(false);
    });

    it("should include roundNumber", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.roundNumber).toBe(1);
    });

    it("should include gamesWon", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.yourGamesWon).toBe(0);
      expect(state.opponents[0].gamesWon).toBe(0);
    });

    it("should include opponent connected status", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.opponents[0].connected).toBe(true);
    });

    it("should include hasPlayedThisTurn as false when no actions taken", () => {
      game.start();
      const state = game.getPlayerState("p1");
      expect(state.hasPlayedThisTurn).toBe(false);
    });

    it("should include hasPlayedThisTurn as true after playing sets", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      const state = game.getPlayerState("p1");
      expect(state.hasPlayedThisTurn).toBe(true);
    });

    it("should include hasPlayedThisTurn as false after undo clears actions", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.undoTurn("p1");
      const state = game.getPlayerState("p1");
      expect(state.hasPlayedThisTurn).toBe(false);
    });

    it("should return multiple opponents for 3-player game", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      const state = fresh.getPlayerState("p1");
      expect(state.opponents).toHaveLength(2);
      expect(state.opponents.map((o) => o.name)).toEqual(["Bob", "Charlie"]);
    });

    it("should return three opponents for 4-player game", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      fresh.start();

      const state = fresh.getPlayerState("p1");
      expect(state.opponents).toHaveLength(3);
    });
  });

  describe("turn snapshot and undo", () => {
    beforeEach(() => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
        makeTile("blue", 1, "b1a"),
      ];
      game.getState().players[1].rack = [
        makeTile("black", 1, "bk1a"),
      ];
    });

    it("should not have turn snapshot until first action", () => {
      expect(game.getState().turnSnapshot).toBeNull();
    });

    it("should undo turn and revert board and rack to start-of-turn state", () => {
      const originalRack = [...game.getState().players[0].rack];
      const originalBoard = [...game.getState().board];

      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);

      expect(game.getState().board).toHaveLength(1);
      expect(game.getState().players[0].rack).toHaveLength(1);

      game.undoTurn("p1");

      expect(game.getState().players[0].rack.map((t) => t.id)).toEqual(originalRack.map((t) => t.id));
      expect(game.getState().board).toHaveLength(originalBoard.length);
    });

    it("should reject undo if not current player", () => {
      expect(() => game.undoTurn("p2")).toThrow();
    });

    it("should undo after manipulateBoard", () => {
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");
      game.drawTile("p2");

      game.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
      ];

      const originalBoard = game.getState().board.map((s) => ({ ...s, tiles: [...s.tiles] }));
      const originalRack = [...game.getState().players[0].rack];

      game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ]);

      game.undoTurn("p1");
      expect(game.getState().board.map((s) => s.tiles.map((t) => t.id))).toEqual(originalBoard.map((s) => s.tiles.map((t) => t.id)));
      expect(game.getState().players[0].rack.map((t) => t.id)).toEqual(originalRack.map((t) => t.id));
    });

    it("should handle multiple manipulations + undo", () => {
      const preActionRack = [...game.getState().players[0].rack];
      const preActionBoard = game.getState().board.length;

      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.undoTurn("p1");
      expect(game.getState().players[0].rack.map((t) => t.id)).toEqual(preActionRack.map((t) => t.id));
      expect(game.getState().board).toHaveLength(preActionBoard);
    });
  });

  describe("manipulateBoard", () => {
    let gameWithBoard: Game;

    beforeEach(() => {
      gameWithBoard = new Game("TEST01");
      gameWithBoard.addPlayer("p1", "Alice");
      gameWithBoard.addPlayer("p2", "Bob");
      gameWithBoard.start();

      gameWithBoard.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      gameWithBoard.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      gameWithBoard.endTurn("p1");

      gameWithBoard.getState().players[1].rack = [makeTile("black", 1, "bk1a")];
      gameWithBoard.drawTile("p2");

      gameWithBoard.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("blue", 2, "b2a"),
        makeTile("orange", 7, "o7a"),
      ];
    });

    it("should add a tile to extend an existing run", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ];
      gameWithBoard.manipulateBoard("p1", newBoard);
      expect(gameWithBoard.getState().board[0].tiles).toHaveLength(4);
      expect(gameWithBoard.getState().players[0].rack).toHaveLength(2);
    });

    it("should reject if resulting board has invalid sets", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 12, "r12a")] },
      ];
      expect(() => gameWithBoard.manipulateBoard("p1", newBoard)).toThrow();
    });

    it("should reject if a set has fewer than 3 tiles", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a")] },
      ];
      expect(() => gameWithBoard.manipulateBoard("p1", newBoard)).toThrow();
    });

    it("should reject if tiles appear that were not on the board or in player rack", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("black", 1, "bk1a"), makeTile("black", 2, "bk2a"), makeTile("black", 3, "bk3a")] },
      ];
      expect(() => gameWithBoard.manipulateBoard("p1", newBoard)).toThrow(/not available/i);
    });

    it("should reject if player has not made initial meld and tries to manipulate", () => {
      gameWithBoard.getState().players[0].hasInitialMeld = false;
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ];
      expect(() => gameWithBoard.manipulateBoard("p1", newBoard)).toThrow(/initial meld/i);
    });

    it("should reject if not the current player", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ];
      expect(() => gameWithBoard.manipulateBoard("p2", newBoard)).toThrow();
    });
  });

  describe("initial meld with manipulation", () => {
    it("should reject manipulation before initial meld", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");

      game.drawTile("p2");

      game.getState().players[0].hasInitialMeld = false;
      expect(() => game.manipulateBoard("p1", [])).toThrow(/initial meld/i);
    });

    it("should allow initial meld with joker counting as represented tile value", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("red", 11, "r11a"),
        joker("joker-1"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] }]);
      game.endTurn("p1");
      expect(game.getState().players[0].hasInitialMeld).toBe(true);
    });

    it("should allow manipulation after initial meld", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
        makeTile("red", 9, "r9a"),
      ];
      game.getState().players[1].rack = [];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");
      game.drawTile("p2");

      expect(game.getState().players[0].hasInitialMeld).toBe(true);
      game.getState().players[0].rack = [makeTile("red", 9, "r9a")];
      game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ]);
      expect(game.getState().board[0].tiles).toHaveLength(4);
    });
  });

  describe("joker handling", () => {
    it("should allow playing a joker in a run", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("red", 11, "r11a"),
        joker("joker-1"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] }]);
      expect(game.getState().board).toHaveLength(1);
    });

    it("should allow playing a joker in a group", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 7, "r7a"),
        makeTile("black", 7, "bk7a"),
        joker("joker-1"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [joker("joker-1"), makeTile("red", 7, "r7a"), makeTile("black", 7, "bk7a")] }]);
      expect(game.getState().board).toHaveLength(1);
    });

    it("should retrieve joker by replacing with the exact tile it represents and using freed joker in new set", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("red", 11, "r11a"),
        joker("joker-1"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] }]);
      game.endTurn("p1");

      game.drawTile("p2");

      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("blue", 5, "b5a"),
        joker("joker-2"),
      ];

      game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a")] },
        { id: "s2", tiles: [joker("joker-1"), makeTile("blue", 5, "b5a"), joker("joker-2")] },
      ]);

      expect(game.getState().board).toHaveLength(2);
      expect(game.getState().players[0].rack).toHaveLength(0);
    });

    it("should reject freed joker not used in same turn", () => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("red", 11, "r11a"),
        joker("joker-1"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] }]);
      game.endTurn("p1");

      game.drawTile("p2");

      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("blue", 5, "b5a"),
        makeTile("orange", 5, "o5a"),
      ];

      expect(() => game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a")] },
        { id: "s2", tiles: [makeTile("blue", 5, "b5a"), makeTile("orange", 5, "o5a"), makeTile("red", 5, "r5b")] },
      ])).toThrow();
    });

    it("should reject joker retrieval before initial meld", () => {
      game.start();
      game.getState().board = [{ id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] }];
      game.getState().players[0].hasInitialMeld = false;
      game.getState().players[0].rack = [makeTile("red", 10, "r10a")];

      expect(() => game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a")] },
      ])).toThrow(/initial meld/i);
    });

    it("should reject joker retrieval when no rack tile played this turn", () => {
      game.start();
      game.getState().board = [
        { id: "s1", tiles: [joker("joker-1"), makeTile("red", 5, "r5a"), makeTile("black", 5, "bk5a")] },
        { id: "s2", tiles: [makeTile("blue", 3, "b3a"), makeTile("blue", 4, "b4a"), makeTile("blue", 5, "b5a")] },
      ];
      game.getState().players[0].hasInitialMeld = true;
      game.getState().players[0].rack = [
        makeTile("orange", 1, "o1a"),
      ];

      expect(() => game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 5, "r5a"), makeTile("black", 5, "bk5a"), makeTile("blue", 5, "b5a")] },
        { id: "s2", tiles: [joker("joker-1"), makeTile("blue", 3, "b3a"), makeTile("blue", 4, "b4a")] },
      ])).toThrow(/rack tile/i);
    });

    it("should allow joker retrieval when at least one rack tile is also played", () => {
      game.start();
      game.getState().board = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), joker("joker-1"), makeTile("red", 11, "r11a")] },
      ];
      game.getState().players[0].hasInitialMeld = true;
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("blue", 5, "b5a"),
        makeTile("orange", 5, "o5a"),
      ];

      game.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a")] },
        { id: "s2", tiles: [joker("joker-1"), makeTile("blue", 5, "b5a"), makeTile("orange", 5, "o5a")] },
      ]);

      expect(game.getState().board).toHaveLength(2);
      expect(game.getState().players[0].rack).toHaveLength(0);
    });
  });

  describe("stalemate detection", () => {
    beforeEach(() => {
      game.start();
    });

    it("should reject passTurn when pool is not empty", () => {
      expect(() => game.passTurn("p1")).toThrow(/pool.*empty/i);
    });

    it("should allow passTurn when pool is empty", () => {
      game.getState().pool = [];
      game.passTurn("p1");
      expect(game.getState().currentTurnIndex).toBe(1);
    });

    it("should increment consecutivePasses on pass", () => {
      game.getState().pool = [];
      game.passTurn("p1");
      expect(game.getState().consecutivePasses).toBe(1);
    });

    it("should end game when both players pass consecutively", () => {
      game.getState().pool = [];
      game.passTurn("p1");
      game.passTurn("p2");
      expect(game.getState().phase).toBe("ended");
    });

    it("should not end game on single pass", () => {
      game.getState().pool = [];
      game.passTurn("p1");
      expect(game.getState().phase).toBe("playing");
    });

    it("should reset consecutive pass counter when a draw is made", () => {
      game.getState().pool = [];
      game.passTurn("p1");
      expect(game.getState().consecutivePasses).toBe(1);

      game.getState().pool = [makeTile("red", 1)];
      game.drawTile("p2");
      expect(game.getState().consecutivePasses).toBe(0);
    });

    it("should require all N players to pass for stalemate in 3-player game", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();
      fresh.getState().pool = [];

      fresh.passTurn("p1");
      expect(fresh.getState().phase).toBe("playing");
      fresh.passTurn("p2");
      expect(fresh.getState().phase).toBe("playing");
      fresh.passTurn("p3");
      expect(fresh.getState().phase).toBe("ended");
    });

    it("should require all 4 players to pass for stalemate in 4-player game", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.addPlayer("p4", "Diana");
      fresh.start();
      fresh.getState().pool = [];

      fresh.passTurn("p1");
      expect(fresh.getState().phase).toBe("playing");
      fresh.passTurn("p2");
      expect(fresh.getState().phase).toBe("playing");
      fresh.passTurn("p3");
      expect(fresh.getState().phase).toBe("playing");
      fresh.passTurn("p4");
      expect(fresh.getState().phase).toBe("ended");
    });
  });

  describe("cumulative scoring and play again", () => {
    beforeEach(() => {
      game.start();
    });

    it("should start new round and reset board and pool", () => {
      game.getState().players[0].rack = [];
      game.getState().players[1].rack = [makeTile("red", 5)];
      game.checkGameEnd();
      game.calculateScores();
      game.startNewRound();
      expect(game.getState().phase).toBe("playing");
      expect(game.getState().board).toHaveLength(0);
      expect(game.getState().pool.length).toBeGreaterThan(0);
    });

    it("should preserve cumulative scores across rounds", () => {
      game.getState().players[0].rack = [];
      game.getState().players[1].rack = [makeTile("red", 5)];
      game.checkGameEnd();
      const scores = game.calculateScores()!;
      game.applyScores(scores);
      const p1ScoreBefore = game.getState().players[0].score;
      const p2ScoreBefore = game.getState().players[1].score;
      game.startNewRound();
      expect(game.getState().players[0].score).toBe(p1ScoreBefore);
      expect(game.getState().players[1].score).toBe(p2ScoreBefore);
    });

    it("should increment gamesWon for the winner", () => {
      game.getState().players[0].rack = [];
      const endResult = game.checkGameEnd();
      if (endResult) {
        const winner = game.getState().players.find((p) => p.id === endResult.winnerId);
        if (winner) winner.gamesWon++;
      }
      game.startNewRound();
      expect(game.getState().players[0].gamesWon).toBe(1);
      expect(game.getState().players[1].gamesWon).toBe(0);
    });

    it("should deal 14 tiles to each player in new round", () => {
      game.getState().players[0].rack = [];
      game.checkGameEnd();
      game.startNewRound();
      for (const player of game.getState().players) {
        expect(player.rack).toHaveLength(INITIAL_HAND_SIZE);
      }
    });

    it("should reset hasInitialMeld for all players", () => {
      game.getState().players[0].rack = [];
      game.getState().players[0].hasInitialMeld = true;
      game.checkGameEnd();
      game.startNewRound();
      for (const player of game.getState().players) {
        expect(player.hasInitialMeld).toBe(false);
      }
    });

    it("should increment roundNumber", () => {
      game.getState().players[0].rack = [];
      game.checkGameEnd();
      game.startNewRound();
      expect(game.getState().roundNumber).toBe(2);
    });
  });

  describe("reconnection", () => {
    beforeEach(() => {
      game.start();
    });

    it("should mark player as connected on reconnect", () => {
      game.getState().players[0].connected = false;
      game.reconnectPlayer("p1");
      expect(game.getState().players[0].connected).toBe(true);
    });

    it("should reject reconnection for unknown player", () => {
      expect(() => game.reconnectPlayer("p99")).toThrow();
    });
  });

  describe("endTurnWithBoard", () => {
    let gameWithBoard: Game;

    beforeEach(() => {
      gameWithBoard = new Game("TEST01");
      gameWithBoard.addPlayer("p1", "Alice");
      gameWithBoard.addPlayer("p2", "Bob");
      gameWithBoard.start();

      gameWithBoard.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      gameWithBoard.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      gameWithBoard.endTurn("p1");

      gameWithBoard.drawTile("p2");

      gameWithBoard.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("blue", 2, "b2a"),
      ];
    });

    it("should manipulate board and end turn atomically", () => {
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ];
      gameWithBoard.endTurnWithBoard("p1", newBoard);
      expect(gameWithBoard.getState().board[0].tiles).toHaveLength(4);
      expect(gameWithBoard.getState().currentTurnIndex).toBe(1);
      expect(gameWithBoard.getState().players[0].rack).toHaveLength(1);
    });

    it("should reject invalid board without ending turn", () => {
      const invalidBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 12, "r12a")] },
      ];
      expect(() => gameWithBoard.endTurnWithBoard("p1", invalidBoard)).toThrow();
      expect(gameWithBoard.getState().currentTurnIndex).toBe(0);
    });

    it("should reject manipulation before initial meld without ending turn", () => {
      gameWithBoard.getState().players[0].hasInitialMeld = false;
      const newBoard: TileSet[] = [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ];
      expect(() => gameWithBoard.endTurnWithBoard("p1", newBoard)).toThrow(/initial meld/i);
      expect(gameWithBoard.getState().currentTurnIndex).toBe(0);
    });

    it("should work without newBoard like regular endTurn", () => {
      gameWithBoard.getState().players[0].rack = [
        makeTile("red", 9, "r9a"),
        makeTile("blue", 2, "b2a"),
        makeTile("orange", 7, "o7a"),
      ];
      gameWithBoard.manipulateBoard("p1", [
        { id: "s1", tiles: [makeTile("red", 9, "r9a"), makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] },
      ]);
      gameWithBoard.endTurnWithBoard("p1");
      expect(gameWithBoard.getState().currentTurnIndex).toBe(1);
    });
  });

  describe("seedGame", () => {
    it("should set board, racks, pool, and phase", () => {
      game.start();
      game.seedGame({
        board: [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }],
        racks: {
          p1: [makeTile("red", 9, "r9a")],
          p2: [makeTile("blue", 5, "b5a")],
        },
        pool: [],
        currentTurnPlayerId: "p1",
        hasInitialMeld: { p1: true, p2: true },
      });
      expect(game.getState().board).toHaveLength(1);
      expect(game.getState().players[0].rack).toHaveLength(1);
      expect(game.getState().players[1].rack).toHaveLength(1);
      expect(game.getState().pool).toHaveLength(0);
      expect(game.getState().currentTurnIndex).toBe(0);
      expect(game.getState().players[0].hasInitialMeld).toBe(true);
      expect(game.getState().players[1].hasInitialMeld).toBe(true);
    });

    it("should set correct current turn by player ID", () => {
      game.start();
      game.seedGame({
        board: [],
        racks: { p1: [], p2: [] },
        pool: [],
        currentTurnPlayerId: "p2",
        hasInitialMeld: { p1: true, p2: true },
      });
      expect(game.getState().currentTurnIndex).toBe(1);
    });
  });

  describe("player rack value with jokers", () => {
    it("should calculate rack value with joker penalty", () => {
      game.start();
      game.getState().players[0].rack = [makeTile("red", 5), joker("joker-1")];
      const value = game.getRackValue("p1");
      expect(value).toBe(5 + JOKER_PENALTY);
    });
  });

  describe("3-player turn rotation", () => {
    it("should rotate turns through 3 players", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      expect(fresh.getState().currentTurnIndex).toBe(0);

      fresh.getState().pool = [makeTile("red", 1)];
      fresh.drawTile("p1");
      expect(fresh.getState().currentTurnIndex).toBe(1);

      fresh.getState().pool = [makeTile("blue", 1)];
      fresh.drawTile("p2");
      expect(fresh.getState().currentTurnIndex).toBe(2);

      fresh.getState().pool = [makeTile("black", 1)];
      fresh.drawTile("p3");
      expect(fresh.getState().currentTurnIndex).toBe(0);
    });
  });

  describe("getSpectatorState", () => {
    beforeEach(() => {
      game.start();
      game.getState().players[0].rack = [
        makeTile("red", 10, "r10a"),
        makeTile("red", 11, "r11a"),
        makeTile("red", 12, "r12a"),
      ];
      game.playSets("p1", [{ id: "s1", tiles: [makeTile("red", 10, "r10a"), makeTile("red", 11, "r11a"), makeTile("red", 12, "r12a")] }]);
      game.endTurn("p1");
    });

    it("should return correct structure", () => {
      const state = game.getSpectatorState();
      expect(state).toBeDefined();
      expect(state.type).toBe("spectator");
      expect(state.id).toBe("TEST01");
      expect(state.phase).toBe("playing");
      expect(state.board).toBeDefined();
      expect(state.poolSize).toBeGreaterThan(0);
      expect(state.currentTurnPlayerId).toBe("p2");
      expect(state.roundNumber).toBe(1);
      expect(state.consecutivePasses).toBe(0);
    });

    it("should include all player names without rack sizes", () => {
      const state = game.getSpectatorState();
      expect(state.players).toHaveLength(2);
      const p1 = state.players.find((p) => p.id === "p1")!;
      const p2 = state.players.find((p) => p.id === "p2")!;
      expect(p1.name).toBe("Alice");
      expect(p2.name).toBe("Bob");
      expect((p1 as { rackSize?: number }).rackSize).toBeUndefined();
      expect((p2 as { rackSize?: number }).rackSize).toBeUndefined();
    });

    it("should not include any player rack tiles", () => {
      const state = game.getSpectatorState();
      for (const p of state.players) {
        expect((p as { rack?: Tile[] }).rack).toBeUndefined();
      }
    });

    it("should include player scores and gamesWon", () => {
      const state = game.getSpectatorState();
      const p1 = state.players.find((p) => p.id === "p1")!;
      expect(p1.score).toBe(0);
      expect(p1.gamesWon).toBe(0);
    });

    it("should include connected status", () => {
      const state = game.getSpectatorState();
      const p1 = state.players.find((p) => p.id === "p1")!;
      expect(p1.connected).toBe(true);
    });

    it("should not include youRack field from PlayerGameState", () => {
      const state = game.getSpectatorState();
      expect((state as { yourRack?: Tile[] }).yourRack).toBeUndefined();
      expect((state as { opponentRackSize?: number }).opponentRackSize).toBeUndefined();
    });

    it("should include all players in 3-player game", () => {
      const fresh = new Game("TEST01");
      fresh.addPlayer("p1", "Alice");
      fresh.addPlayer("p2", "Bob");
      fresh.addPlayer("p3", "Charlie");
      fresh.start();

      const state = fresh.getSpectatorState();
      expect(state.players).toHaveLength(3);
    });
  });
});

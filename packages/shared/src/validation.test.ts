import { describe, it, expect } from "vitest";
import { isValidRun, isValidGroup, isValidSet, isValidBoard, calculateSetValue, resolveJokerValue, formSetsFromTiles, sortSetTiles, getSetValidationError, getBoardValidationErrors } from "./validation";
import type { Tile, TileSet } from "./types";

function tile(color: Tile["color"], value: number, id?: string): Tile {
  return { id: id ?? `${color}-${value}-a`, color, value: value as Tile["value"] };
}

function joker(id: string): Tile {
  return { id, color: "joker", value: 0 };
}

describe("isValidRun", () => {
  it("should accept a valid run of 3 consecutive same-color tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run longer than 3", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5), tile("red", 6), tile("red", 7)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should reject a run with fewer than 3 tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject non-consecutive values", () => {
    const tiles = [tile("red", 3), tile("red", 5), tile("red", 6)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject mixed colors", () => {
    const tiles = [tile("red", 3), tile("blue", 4), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject run that wraps from 13 to 1", () => {
    const tiles = [tile("red", 12), tile("red", 13), tile("red", 1)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should accept a run starting at 1", () => {
    const tiles = [tile("blue", 1), tile("blue", 2), tile("blue", 3)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run ending at 13", () => {
    const tiles = [tile("black", 11), tile("black", 12), tile("black", 13)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should reject unsorted tiles", () => {
    const tiles = [tile("red", 5), tile("red", 3), tile("red", 4)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should accept a run with joker in the middle", () => {
    const tiles = [tile("red", 3), joker("joker-1"), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run with joker at start", () => {
    const tiles = [joker("joker-1"), tile("red", 4), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run with joker at end", () => {
    const tiles = [tile("red", 3), tile("red", 4), joker("joker-1")];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run with two jokers", () => {
    const tiles = [tile("red", 3), joker("joker-1"), joker("joker-2"), tile("red", 6)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should reject a run where joker would need value > 13", () => {
    const tiles = [tile("red", 12), tile("red", 13), joker("joker-1")];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject a run where joker would need value < 1", () => {
    const tiles = [joker("joker-1"), tile("red", 1), tile("red", 2)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject two jokers that cannot both fit in the run", () => {
    const tiles = [tile("red", 12), joker("joker-1"), joker("joker-2"), tile("red", 13)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should accept a run with two jokers at start", () => {
    const tiles = [joker("joker-1"), joker("joker-2"), tile("red", 3)];
    expect(isValidRun(tiles)).toBe(true);
  });
});

describe("isValidGroup", () => {
  it("should accept a valid group of 3 same-value different-color tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should accept a group of 4 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7), tile("orange", 7)];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should reject a group with fewer than 3 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject a group with more than 4 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7), tile("orange", 7), tile("red", 7, "red-7-b")];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject duplicate colors in a group", () => {
    const tiles = [tile("red", 7), tile("red", 7, "red-7-b"), tile("blue", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject different values in a group", () => {
    const tiles = [tile("red", 7), tile("blue", 8), tile("black", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should accept a group with a joker", () => {
    const tiles = [tile("red", 7), joker("joker-1"), tile("black", 7)];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should accept a group with two jokers and one real tile", () => {
    const tiles = [tile("red", 7), joker("joker-1"), joker("joker-2")];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should accept a group with two jokers and two real tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), joker("joker-1"), joker("joker-2")];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should reject a group where joker would create duplicate color", () => {
    const tiles = [tile("red", 7), tile("red", 7, "red-7-b"), joker("joker-1")];
    expect(isValidGroup(tiles)).toBe(false);
  });
});

describe("isValidSet", () => {
  it("should accept a valid run", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(isValidSet(tiles)).toBe(true);
  });

  it("should accept a valid group", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    expect(isValidSet(tiles)).toBe(true);
  });

  it("should reject an invalid set", () => {
    const tiles = [tile("red", 3), tile("blue", 7), tile("black", 10)];
    expect(isValidSet(tiles)).toBe(false);
  });

  it("should accept a run with joker", () => {
    const tiles = [tile("red", 3), joker("joker-1"), tile("red", 5)];
    expect(isValidSet(tiles)).toBe(true);
  });

  it("should accept a group with joker", () => {
    const tiles = [tile("red", 7), joker("joker-1"), tile("black", 7)];
    expect(isValidSet(tiles)).toBe(true);
  });
});

describe("isValidBoard", () => {
  it("should return true when all sets are valid", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4), tile("red", 5)] },
      { id: "s2", tiles: [tile("blue", 7), tile("orange", 7), tile("black", 7)] },
    ];
    expect(isValidBoard(board)).toBe(true);
  });

  it("should return false when any set is invalid", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4), tile("red", 5)] },
      { id: "s2", tiles: [tile("blue", 7), tile("blue", 7, "blue-7-b")] },
    ];
    expect(isValidBoard(board)).toBe(false);
  });

  it("should return true for an empty board", () => {
    expect(isValidBoard([])).toBe(true);
  });

  it("should return true for a board with joker sets", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), joker("joker-1"), tile("red", 5)] },
    ];
    expect(isValidBoard(board)).toBe(true);
  });

  it("should return false when a set has fewer than 3 tiles", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4)] },
    ];
    expect(isValidBoard(board)).toBe(false);
  });
});

describe("calculateSetValue", () => {
  it("should sum tile values", () => {
    const tiles = [tile("red", 10), tile("red", 11), tile("red", 12)];
    expect(calculateSetValue(tiles)).toBe(33);
  });

  it("should sum values for a group", () => {
    const tiles = [tile("red", 5), tile("blue", 5), tile("black", 5)];
    expect(calculateSetValue(tiles)).toBe(15);
  });

  it("should count joker as its resolved value in a run", () => {
    const tiles = [tile("red", 9), joker("joker-1"), tile("red", 11)];
    expect(calculateSetValue(tiles)).toBe(30);
  });

  it("should count joker as its resolved value in a group", () => {
    const tiles = [tile("red", 7), joker("joker-1"), tile("black", 7)];
    expect(calculateSetValue(tiles)).toBe(21);
  });
});

describe("resolveJokerValue", () => {
  it("should resolve joker in the middle of a run", () => {
    const tiles = [tile("red", 3), joker("joker-1"), tile("red", 5)];
    expect(resolveJokerValue(tiles[1], tiles)).toBe(4);
  });

  it("should resolve joker at the start of a run", () => {
    const tiles = [joker("joker-1"), tile("red", 4), tile("red", 5)];
    expect(resolveJokerValue(tiles[0], tiles)).toBe(3);
  });

  it("should resolve joker at the end of a run", () => {
    const tiles = [tile("red", 3), tile("red", 4), joker("joker-1")];
    expect(resolveJokerValue(tiles[2], tiles)).toBe(5);
  });

  it("should resolve joker in a group", () => {
    const tiles = [joker("joker-1"), tile("black", 5), tile("orange", 5)];
    expect(resolveJokerValue(tiles[0], tiles)).toBe(5);
  });

  it("should return 0 for non-joker tile", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(resolveJokerValue(tiles[0], tiles)).toBe(0);
  });

  it("should resolve ambiguous set as group when tiles have same value different colors", () => {
    const tiles = [tile("red", 5), joker("joker-1"), tile("black", 5)];
    expect(resolveJokerValue(tiles[1], tiles)).toBe(5);
  });

  it("should prefer group interpretation for [red-5, joker, black-5]", () => {
    const tiles = [tile("red", 5), joker("joker-1"), tile("black", 5)];
    expect(resolveJokerValue(tiles[1], tiles)).toBe(5);
  });

  it("should resolve joker in a 4-tile group", () => {
    const tiles = [tile("red", 5), joker("joker-1"), tile("black", 5), tile("orange", 5)];
    expect(resolveJokerValue(tiles[1], tiles)).toBe(5);
  });

  it("should return 0 when joker is in an invalid set", () => {
    const tiles = [joker("joker-1"), tile("red", 5)];
    expect(resolveJokerValue(tiles[0], tiles)).toBe(0);
  });
});

describe("formSetsFromTiles", () => {
  it("should form a run from consecutive same-color tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(sets[0].tiles).toHaveLength(3);
  });

  it("should form a group from same-value different-color tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(sets[0].tiles).toHaveLength(3);
  });

  it("should return empty for tiles that don't form valid sets", () => {
    const tiles = [tile("red", 3), tile("blue", 7), tile("black", 10)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(0);
  });

  it("should form a run with joker filling a gap", () => {
    const tiles = [tile("red", 10), joker("j1"), tile("red", 12)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(sets[0].tiles).toHaveLength(3);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });

  it("should form a run with joker at the start", () => {
    const tiles = [joker("j1"), tile("red", 11), tile("red", 12)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });

  it("should form a run with joker at the end", () => {
    const tiles = [tile("red", 12), tile("red", 13), joker("j1")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });

  it("should form a group with joker as wildcard", () => {
    const tiles = [tile("red", 7), joker("j1"), tile("black", 7)];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidGroup(sets[0].tiles)).toBe(true);
  });

  it("should form a group with two jokers", () => {
    const tiles = [tile("red", 7), joker("j1"), joker("j2")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidGroup(sets[0].tiles)).toBe(true);
  });

  it("should form a run from unsorted tiles with joker", () => {
    const tiles = [tile("red", 13), tile("red", 12), joker("j1")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });

  it("should form a run with joker inserted between non-consecutive tiles", () => {
    const tiles = [tile("red", 9), tile("red", 11), joker("j1")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });

  it("should return empty when joker cannot bridge the gap", () => {
    const tiles = [tile("red", 1), tile("red", 5), joker("j1")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(0);
  });

  it("should handle two jokers in a run", () => {
    const tiles = [tile("red", 3), tile("red", 6), joker("j1"), joker("j2")];
    const sets = formSetsFromTiles(tiles);
    expect(sets).toHaveLength(1);
    expect(isValidRun(sets[0].tiles)).toBe(true);
  });
});

describe("sortSetTiles", () => {
  it("should sort a simple unsorted run", () => {
    const tiles = [tile("red", 5), tile("red", 3), tile("red", 4)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.value)).toEqual([3, 4, 5]);
  });

  it("should return sorted run when already sorted", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.value)).toEqual([3, 4, 5]);
  });

  it("should return as-is for a group", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should return as-is for mixed-color set", () => {
    const tiles = [tile("red", 3), tile("blue", 4), tile("red", 5)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should sort a run with joker in wrong position", () => {
    const tiles = [tile("red", 5), joker("joker-1"), tile("red", 3)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(["red-3-a", "joker-1", "red-5-a"]);
  });

  it("should sort joker at start of run when end is not valid", () => {
    const tiles = [tile("red", 12), joker("joker-1"), tile("red", 13)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(["joker-1", "red-12-a", "red-13-a"]);
  });

  it("should keep joker at end when already correct", () => {
    const tiles = [tile("red", 3), tile("red", 4), joker("joker-1")];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(["red-3-a", "red-4-a", "joker-1"]);
  });

  it("should handle two jokers in a run", () => {
    const tiles = [tile("red", 3), tile("red", 6), joker("j1"), joker("j2")];
    const result = sortSetTiles(tiles);
    expect(isValidRun(result)).toBe(true);
    expect(result.map((t) => t.id)).toEqual(["red-3-a", "j1", "j2", "red-6-a"]);
  });

  it("should return as-is for tiles that cannot form a valid run", () => {
    const tiles = [tile("red", 3), tile("red", 7), tile("red", 10)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should return as-is for single tile", () => {
    const tiles = [tile("red", 3)];
    const result = sortSetTiles(tiles);
    expect(result).toEqual(tiles);
  });

  it("should return as-is for empty array", () => {
    const result = sortSetTiles([]);
    expect(result).toEqual([]);
  });

  it("should return as-is for two tiles that are consecutive", () => {
    const tiles = [tile("red", 4), tile("red", 3)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.value)).toEqual([3, 4]);
  });

  it("should return as-is for two tiles that are not consecutive", () => {
    const tiles = [tile("red", 3), tile("red", 7)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should return as-is for all jokers", () => {
    const tiles = [joker("j1"), joker("j2")];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should return as-is when gap between tiles exceeds available jokers", () => {
    const tiles = [tile("red", 3), tile("red", 7), joker("j1")];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.id)).toEqual(tiles.map((t) => t.id));
  });

  it("should sort a long unsorted run", () => {
    const tiles = [tile("red", 7), tile("red", 3), tile("red", 5), tile("red", 4), tile("red", 6)];
    const result = sortSetTiles(tiles);
    expect(result.map((t) => t.value)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("getSetValidationError", () => {
  it("should return null for a valid run of 3 consecutive same-color tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(getSetValidationError(tiles, "s1")).toBeNull();
  });

  it("should return null for a valid group of same-value different-color tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    expect(getSetValidationError(tiles, "s1")).toBeNull();
  });

  it("should return too_few_tiles for a set with 2 tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("too_few_tiles");
    expect(result!.setId).toBe("s1");
  });

  it("should return too_many_tiles for a set with 5 tiles that is not a run", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7), tile("orange", 7), tile("red", 7, "red-7-b")];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("too_many_tiles");
  });

  it("should return all_jokers when every tile is a joker", () => {
    const tiles = [joker("j1"), joker("j2"), joker("j3")];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("all_jokers");
  });

  it("should return run_mixed_colors when tiles have consecutive values but mixed colors", () => {
    const tiles = [tile("red", 3), tile("blue", 4), tile("red", 5)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("run_mixed_colors");
  });

  it("should return run_non_consecutive for a run with a gap", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 6)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("run_non_consecutive");
  });

  it("should return group_duplicate_colors for a group with duplicate colors", () => {
    const tiles = [tile("red", 7), tile("red", 7, "red-7-b"), tile("blue", 7)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("group_duplicate_colors");
  });

  it("should return not_valid for a set that is neither a run nor a group", () => {
    const tiles = [tile("red", 3), tile("blue", 7), tile("red", 10)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("not_valid");
  });

  it("should return null for a valid run with a joker", () => {
    const tiles = [tile("red", 3), joker("j1"), tile("red", 5)];
    expect(getSetValidationError(tiles, "s1")).toBeNull();
  });

  it("should return null for a valid group with a joker", () => {
    const tiles = [tile("red", 7), joker("j1"), tile("black", 7)];
    expect(getSetValidationError(tiles, "s1")).toBeNull();
  });

  it("should return too_few_tiles for a single tile", () => {
    const tiles = [tile("red", 3)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("too_few_tiles");
  });

  it("should return group_duplicate_colors for two reds and one blue with same value", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("red", 7, "red-7-b")];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("group_duplicate_colors");
  });

  it("should return run_mixed_colors for a set with consecutive values across different colors", () => {
    const tiles = [tile("red", 3), tile("blue", 4), tile("black", 5)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("run_mixed_colors");
  });

  it("should return group_mixed_values when colors suggest a group but values differ", () => {
    const tiles = [tile("red", 7), tile("blue", 8), tile("black", 7)];
    const result = getSetValidationError(tiles, "s1");
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("group_mixed_values");
  });
});

describe("getBoardValidationErrors", () => {
  it("should return an empty array for a valid board", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4), tile("red", 5)] },
      { id: "s2", tiles: [tile("blue", 7), tile("orange", 7), tile("black", 7)] },
    ];
    expect(getBoardValidationErrors(board)).toEqual([]);
  });

  it("should return errors only for invalid sets", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4), tile("red", 5)] },
      { id: "s2", tiles: [tile("blue", 7), tile("blue", 7, "blue-7-b")] },
    ];
    const errors = getBoardValidationErrors(board);
    expect(errors).toHaveLength(1);
    expect(errors[0].setId).toBe("s2");
    expect(errors[0].reason).toBe("too_few_tiles");
  });

  it("should return errors for multiple invalid sets", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [tile("red", 3), tile("red", 4)] },
      { id: "s2", tiles: [tile("blue", 7), tile("red", 7, "red-7-b"), tile("blue", 7, "blue-7-b")] },
    ];
    const errors = getBoardValidationErrors(board);
    expect(errors).toHaveLength(2);
    expect(errors[0].setId).toBe("s1");
    expect(errors[0].reason).toBe("too_few_tiles");
    expect(errors[1].setId).toBe("s2");
    expect(errors[1].reason).toBe("group_duplicate_colors");
  });

  it("should return an empty array for an empty board", () => {
    expect(getBoardValidationErrors([])).toEqual([]);
  });

  it("should return errors for a board with all-joker set", () => {
    const board: TileSet[] = [
      { id: "s1", tiles: [joker("j1"), joker("j2"), joker("j3")] },
    ];
    const errors = getBoardValidationErrors(board);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toBe("all_jokers");
  });
});

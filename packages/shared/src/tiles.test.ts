import { describe, it, expect } from "vitest";
import { generateAllTiles, shuffleTiles } from "./tiles";
import { COLORS, VALUES, TILES_PER_COPY, TOTAL_NUMBERED_TILES, TOTAL_TILES, JOKER_COUNT } from "./constants";

describe("generateAllTiles", () => {
  it("should return 106 tiles", () => {
    const tiles = generateAllTiles();
    expect(tiles).toHaveLength(TOTAL_TILES);
  });

  it("should have unique IDs for all tiles", () => {
    const tiles = generateAllTiles();
    const ids = tiles.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(TOTAL_TILES);
  });

  it("should have 2 copies of each color-value combination", () => {
    const tiles = generateAllTiles();
    for (const color of COLORS) {
      for (const value of VALUES) {
        const matching = tiles.filter((t) => t.color === color && t.value === value);
        expect(matching).toHaveLength(TILES_PER_COPY);
      }
    }
  });

  it("should include 2 joker tiles", () => {
    const tiles = generateAllTiles();
    const jokers = tiles.filter((t) => t.color === "joker");
    expect(jokers).toHaveLength(JOKER_COUNT);
  });

  it("should have joker tiles with correct IDs", () => {
    const tiles = generateAllTiles();
    const joker1 = tiles.find((t) => t.id === "joker-1");
    const joker2 = tiles.find((t) => t.id === "joker-2");
    expect(joker1).toBeDefined();
    expect(joker2).toBeDefined();
    expect(joker1!.color).toBe("joker");
    expect(joker1!.value).toBe(0);
    expect(joker2!.color).toBe("joker");
    expect(joker2!.value).toBe(0);
  });

  it("should have 104 numbered tiles plus 2 jokers", () => {
    const tiles = generateAllTiles();
    const numbered = tiles.filter((t) => t.color !== "joker");
    expect(numbered).toHaveLength(TOTAL_NUMBERED_TILES);
  });
});

describe("shuffleTiles", () => {
  it("should return the same number of tiles", () => {
    const tiles = generateAllTiles();
    const shuffled = shuffleTiles([...tiles]);
    expect(shuffled).toHaveLength(tiles.length);
  });

  it("should contain all the same tiles", () => {
    const tiles = generateAllTiles();
    const shuffled = shuffleTiles([...tiles]);
    const originalIds = new Set(tiles.map((t) => t.id));
    const shuffledIds = new Set(shuffled.map((t) => t.id));
    expect(shuffledIds).toEqual(originalIds);
  });

  it("should not modify the original array", () => {
    const tiles = generateAllTiles();
    const copy = [...tiles];
    shuffleTiles(tiles);
    expect(tiles.map((t) => t.id)).toEqual(copy.map((t) => t.id));
  });
});

import { describe, it, expect } from "vitest";
import { generateAllTiles, shuffleTiles } from "./tiles";
import { COLORS, VALUES, TILES_PER_COPY, TOTAL_NUMBERED_TILES } from "./constants";

describe("generateAllTiles", () => {
  it("should return 104 tiles", () => {
    const tiles = generateAllTiles();
    expect(tiles).toHaveLength(TOTAL_NUMBERED_TILES);
  });

  it("should have unique IDs for all tiles", () => {
    const tiles = generateAllTiles();
    const ids = tiles.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(TOTAL_NUMBERED_TILES);
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

  it("should not include any joker tiles", () => {
    const tiles = generateAllTiles();
    expect(tiles.every((t) => !(["red", "blue", "orange", "black"] as const).includes(t.color) === false)).toBe(true);
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

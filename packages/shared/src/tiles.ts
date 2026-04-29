import { COLORS, VALUES, TILES_PER_COPY, JOKER_COUNT, JOKER_COLOR, JOKER_VALUE } from "./constants.js";
import type { Tile } from "./types.js";

export function generateAllTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) {
    for (const value of VALUES) {
      for (let copy = 0; copy < TILES_PER_COPY; copy++) {
        const suffix = copy === 0 ? "a" : "b";
        tiles.push({
          id: `${color}-${value}-${suffix}`,
          color,
          value,
        });
      }
    }
  }
  for (let i = 1; i <= JOKER_COUNT; i++) {
    tiles.push({
      id: `joker-${i}`,
      color: JOKER_COLOR,
      value: JOKER_VALUE,
    });
  }
  return tiles;
}

export function shuffleTiles(tiles: Tile[]): Tile[] {
  const result = [...tiles];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

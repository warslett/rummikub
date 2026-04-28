import { MIN_SET_SIZE, MAX_GROUP_SIZE } from "./constants.js";
import type { Tile } from "./types.js";

export function isValidRun(tiles: Tile[]): boolean {
  if (tiles.length < MIN_SET_SIZE) return false;

  const color = tiles[0].color;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].color !== color) return false;
    if (tiles[i].value !== tiles[0].value + i) return false;
  }

  return true;
}

export function isValidGroup(tiles: Tile[]): boolean {
  if (tiles.length < MIN_SET_SIZE || tiles.length > MAX_GROUP_SIZE) return false;

  const value = tiles[0].value;
  const seenColors = new Set<Tile["color"]>();

  for (const tile of tiles) {
    if (tile.value !== value) return false;
    if (seenColors.has(tile.color)) return false;
    seenColors.add(tile.color);
  }

  return true;
}

export function isValidSet(tiles: Tile[]): boolean {
  return isValidRun(tiles) || isValidGroup(tiles);
}

export function calculateSetValue(tiles: Tile[]): number {
  return tiles.reduce((sum, tile) => sum + tile.value, 0);
}

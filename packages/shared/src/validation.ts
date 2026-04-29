import { MIN_SET_SIZE, MAX_GROUP_SIZE, JOKER_COLOR } from "./constants.js";
import type { Tile, TileSet } from "./types.js";

function isJoker(tile: Tile): boolean {
  return tile.color === JOKER_COLOR;
}

export function isValidRun(tiles: Tile[]): boolean {
  if (tiles.length < MIN_SET_SIZE) return false;

  const nonJokers = tiles.filter((t) => !isJoker(t));
  if (nonJokers.length === 0) return false;

  const runColor = nonJokers[0].color;
  for (const t of nonJokers) {
    if (t.color !== runColor) return false;
  }

  for (let start = 1; start <= 14 - tiles.length; start++) {
    let valid = true;
    for (let i = 0; i < tiles.length; i++) {
      const expectedValue = start + i;
      if (!isJoker(tiles[i])) {
        if (tiles[i].value !== expectedValue || tiles[i].color !== runColor) {
          valid = false;
          break;
        }
      }
    }
    if (valid) return true;
  }

  return false;
}

export function isValidGroup(tiles: Tile[]): boolean {
  if (tiles.length < MIN_SET_SIZE || tiles.length > MAX_GROUP_SIZE) return false;

  const nonJokers = tiles.filter((t) => !isJoker(t));

  if (nonJokers.length === 0) return true;

  const value = nonJokers[0].value;
  for (const t of nonJokers) {
    if (t.value !== value) return false;
  }

  const seenColors = new Set<string>();
  for (const t of nonJokers) {
    if (seenColors.has(t.color)) return false;
    seenColors.add(t.color);
  }

  return true;
}

export function isValidSet(tiles: Tile[]): boolean {
  return isValidRun(tiles) || isValidGroup(tiles);
}

export function isValidBoard(board: TileSet[]): boolean {
  for (const set of board) {
    if (!isValidSet(set.tiles)) return false;
  }
  return true;
}

export function calculateSetValue(tiles: Tile[]): number {
  return tiles.reduce((sum, t) => {
    if (isJoker(t)) {
      return sum + resolveJokerValue(t, tiles);
    }
    return sum + (t.value as number);
  }, 0);
}

export function resolveJokerValue(jokerTile: Tile, setTiles: Tile[]): number {
  if (!isJoker(jokerTile)) return 0;

  if (isValidGroup(setTiles)) {
    const nonJokers = setTiles.filter((t) => !isJoker(t));
    if (nonJokers.length === 0) return 0;
    return nonJokers[0].value as number;
  }

  if (isValidRun(setTiles)) {
    return resolveJokerInRun(jokerTile, setTiles);
  }

  return 0;
}

export function formSetsFromTiles(tiles: Tile[]): TileSet[] {
  const jokerTiles = tiles.filter(isJoker);
  const nonJokerTiles = tiles.filter((t) => !isJoker(t));

  if (jokerTiles.length === 0) {
    return formSetsNoJokers(nonJokerTiles);
  }

  const byColor = new Map<string, Tile[]>();
  for (const t of nonJokerTiles) {
    if (!byColor.has(t.color)) byColor.set(t.color, []);
    byColor.get(t.color)!.push(t);
  }

  if (byColor.size === 1) {
    const sorted = [...nonJokerTiles].sort((a, b) => (a.value as number) - (b.value as number));
    const run = tryFormRunWithJokers(sorted, jokerTiles);
    if (run) return [{ id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tiles: run }];
  }

  const byValue = new Map<number, Tile[]>();
  for (const t of nonJokerTiles) {
    if (!byValue.has(t.value as number)) byValue.set(t.value as number, []);
    byValue.get(t.value as number)!.push(t);
  }

  if (byValue.size === 1) {
    const group = [...nonJokerTiles, ...jokerTiles];
    if (isValidGroup(group)) {
      return [{ id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tiles: group }];
    }
  }

  return formSetsNoJokers(nonJokerTiles).length > 0
    ? formSetsNoJokers(nonJokerTiles)
    : [];
}

function tryFormRunWithJokers(sorted: Tile[], jokers: Tile[]): Tile[] | null {
  if (sorted.length + jokers.length < MIN_SET_SIZE) return null;

  const nonJokerColor = sorted[0].color;
  for (const t of sorted) {
    if (t.color !== nonJokerColor) return null;
  }

  const atStart = [...jokers, ...sorted];
  if (isValidRun(atStart)) return atStart;

  const atEnd = [...sorted, ...jokers];
  if (isValidRun(atEnd)) return atEnd;

  if (jokers.length === 1) {
    for (let i = 1; i < sorted.length; i++) {
      const attempt = [...sorted.slice(0, i), jokers[0], ...sorted.slice(i)];
      if (isValidRun(attempt)) return attempt;
    }
  }

  if (jokers.length === 2) {
    for (let i = 1; i <= sorted.length; i++) {
      for (let j = i; j <= sorted.length + 1; j++) {
        const attempt = [
          ...sorted.slice(0, i),
          jokers[0],
          ...sorted.slice(i, j),
          jokers[1],
          ...sorted.slice(j),
        ];
        if (isValidRun(attempt)) return attempt;
      }
    }
  }

  return null;
}

function formSetsNoJokers(tiles: Tile[]): TileSet[] {
  const sorted = [...tiles].sort((a, b) => {
    if (a.color !== b.color) return a.color.localeCompare(b.color);
    return (a.value as number) - (b.value as number);
  });

  const sets: TileSet[] = [];
  let current: Tile[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const tile = sorted[i];
    const prev = current[current.length - 1];
    if (tile.color === prev.color && tile.value === prev.value + 1) {
      current.push(tile);
    } else {
      if (isValidSet(current)) sets.push({ id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tiles: [...current] });
      current = [tile];
    }
  }
  if (isValidSet(current)) sets.push({ id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tiles: [...current] });

  if (sets.length === 0) {
    const valueGroups = new Map<number, Tile[]>();
    for (const t of tiles) {
      if (!valueGroups.has(t.value as number)) valueGroups.set(t.value as number, []);
      valueGroups.get(t.value as number)!.push(t);
    }
    for (const [, groupTiles] of valueGroups) {
      if (isValidGroup(groupTiles)) sets.push({ id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tiles: groupTiles });
    }
  }

  return sets;
}

function resolveJokerInRun(jokerTile: Tile, tiles: Tile[]): number {
  const nonJokers = tiles.filter((t) => !isJoker(t));
  const runColor = nonJokers[0].color;

  for (let start = 1; start <= 14 - tiles.length; start++) {
    let valid = true;
    for (let i = 0; i < tiles.length; i++) {
      const expectedValue = start + i;
      if (!isJoker(tiles[i])) {
        if (tiles[i].value !== expectedValue || tiles[i].color !== runColor) {
          valid = false;
          break;
        }
      }
    }
    if (valid) {
      const jokerIndex = tiles.indexOf(jokerTile);
      return start + jokerIndex;
    }
  }

  return 0;
}

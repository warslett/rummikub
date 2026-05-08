# Plan 008: Auto-sort run tiles after placement

## Goal and Scope

When a tile is added to a set on the board (from rack or from another set), automatically sort the tiles in the set so that runs are in ascending value order with jokers placed in their correct positions. This eliminates the UX pain of having to click the precise insertion point to get a valid run.

**Scope:**
- Auto-sort applies when any tile is added to any set (from rack, or moved from another set on the board)
- Only runs are sorted; groups are left as-is
- Jokers are auto-placed in their correct position within the run
- Sorting happens on both client (immediate visual feedback) and server (authoritative validation)

**Out of scope:**
- Sorting groups (no meaningful value order)
- Changing the click-to-place interaction model
- Auto-sorting tiles in the rack

## Acceptance Criteria

1. When a tile is placed into a set that forms a valid run, the tiles are automatically sorted in ascending value order
2. Jokers are placed in their correct position (e.g., filling gaps, at start, or at end of a run)
3. Sets that form groups are not reordered
4. Auto-sort works when adding a tile from the rack to a board set
5. Auto-sort works when moving a tile between board sets
6. Auto-sort works when moving a tile within the same set
7. The server auto-sorts before validation so unsorted runs are accepted
8. The client auto-sorts immediately after placement for visual feedback
9. Existing tests continue to pass

## Edge Cases

1. **Set that could be either a run or a group** (e.g., `[red-5, joker, black-5]`): Only sort if the tiles form a valid run after sorting. If sorting as a run fails, leave tiles as-is (it's a group or invalid).
2. **Multiple jokers in a run**: Both jokers must be placed in correct positions (e.g., `[joker-1, joker-2, red-3]` or `[red-3, joker-1, joker-2, red-6]`).
3. **Joker that cannot fit**: If the joker(s) cannot be placed in any valid position after sorting non-joker tiles, the set is invalid — leave tiles as-is (the end-turn validation will catch it).
4. **Single tile placed into empty area**: Starting a new set with one tile — no sorting needed (not a valid set yet).
5. **Tiles that don't form a valid set**: If after insertion the tiles don't form a valid run, leave them in insertion order (the user will see the error on end turn and can undo).
6. **Moving a tile within the same run**: After removing and re-inserting, the run should still be sorted.

## E2E Tests

All tests go in `packages/qa/tests/manipulation.spec.ts`.

- **TC-59**: Adding a tile to the end of a run (clicking the last tile) auto-sorts correctly
  - Seed: board has `[red-3, red-4, red-5]`, rack has `red-6`
  - Select red-6, click red-5 → tiles become `[red-3, red-4, red-5, red-6]`
  - End turn succeeds

- **TC-60**: Adding a tile to the beginning of a run (clicking the first tile) auto-sorts correctly
  - Seed: board has `[red-4, red-5, red-6]`, rack has `red-3`
  - Select red-3, click red-4 → tiles become `[red-3, red-4, red-5, red-6]` (not `[red-4, red-3, red-5, red-6]`)
  - End turn succeeds

- **TC-61**: Adding a tile to the middle of a run auto-sorts correctly
  - Seed: board has `[red-3, red-4, red-6]`, rack has `red-5`
  - Select red-5, click red-4 → tiles become `[red-3, red-4, red-5, red-6]`
  - End turn succeeds

- **TC-62**: Adding a tile that makes the set a group does not reorder
  - Seed: board has `[red-7, blue-7]`, rack has `black-7` (this is 3 tiles, valid group)
  - Note: 2-tile sets on the board are already invalid, so this test needs a valid 3-tile group that gets extended
  - Seed: board has `[red-7, blue-7, black-7]`, rack has `orange-7`
  - Select orange-7, click any 7 → group stays in its current order (no reordering)
  - End turn succeeds

- **TC-63**: Adding a tile to a run with a joker auto-sorts joker into correct position
  - Seed: board has `[red-3, joker, red-5]`, rack has `red-6`
  - Select red-6, click red-5 → tiles become `[red-3, joker, red-5, red-6]` (joker stays at position 4)
  - End turn succeeds

- **TC-64**: Moving a tile between runs auto-sorts the destination run
  - Seed: board has `[red-3, red-4, red-5]` and `[blue-8, blue-9, blue-10]`, rack has `blue-11`
  - Add blue-11 to blue run, then move blue-8 to red run
  - Red run becomes `[blue-8, red-3, red-4, red-5]` — invalid, but that's expected since colors don't match
  - Actually: use same color. Board has `[red-3, red-4, red-5]` and `[red-8, red-9, red-10]`, rack has `red-7`
  - Move red-8 to the `[red-3, red-4, red-5]` set → auto-sort produces `[red-3, red-4, red-5, red-8]` — still invalid (gap). User can undo.
  - Better test: Board has `[red-3, red-4, red-5]` and `[red-9, red-10, red-11]`, move red-9 out, add red-6 from rack to first run → becomes `[red-3, red-4, red-5, red-6]`

## Implementation Steps

### Step 1: Add `sortSetTiles` function to shared package

Add a new exported function `sortSetTiles(tiles: Tile[]): Tile[]` in `packages/shared/src/validation.ts`.

Logic:
1. If tiles have ≤ 1 element, return as-is
2. Collect non-joker tiles. If 0 non-jokers, return as-is
3. If non-jokers are not all same color → not a run candidate → return as-is
4. Sort non-joker tiles by value (ascending)
5. If there are no jokers, check if sorted non-jokers form consecutive values → if yes, return sorted; if not, return as-is
6. If there are jokers, use `tryFormRunWithJokers(sorted, jokers)` to find correct placement → if it returns a valid run, return that; if not, return as-is
7. Export from `packages/shared/src/index.ts`

**Files**: `packages/shared/src/validation.ts`, `packages/shared/src/index.ts`

### Step 2: Write unit tests for `sortSetTiles`

Add tests in `packages/shared/src/validation.test.ts`:

- Sorts a simple unsorted run: `[red-5, red-3, red-4]` → `[red-3, red-4, red-5]`
- Returns sorted run when already sorted: `[red-3, red-4, red-5]` → same
- Returns as-is for a group: `[red-7, blue-7, black-7]` → same
- Returns as-is for mixed-color set: `[red-3, blue-4, red-5]` → same
- Sorts a run with joker in wrong position: `[red-5, joker, red-3]` → `[red-3, joker, red-5]`
- Sorts joker at start: `[red-4, joker, red-5]` → `[joker, red-4, red-5]`
- Sorts joker at end: `[red-3, red-4, joker]` → same (already correct)
- Handles two jokers: sorts them into correct positions
- Returns as-is for tiles that can't form a valid run
- Returns as-is for single tile
- Returns as-is for empty array

**Files**: `packages/shared/src/validation.test.ts`

### Step 3: Apply auto-sort in client `placeTileOnBoard`

In `packages/client/src/pages/GameBoard.tsx`, after the `splice` on line 217, call `sortSetTiles` on the modified set:

```
import { sortSetTiles } from "@rummikub/shared";

// After line 217 (wb[targetSetIndex].tiles.splice(targetTileIndex + 1, 0, tile)):
wb[targetSetIndex].tiles = sortSetTiles(wb[targetSetIndex].tiles);
```

Also apply in `startNewSetWithTile` — though a single tile can't be a run, this ensures consistency if the user builds up a set incrementally (though the 2-tile case won't be sorted since it's not a valid set yet, `sortSetTiles` handles this).

**Files**: `packages/client/src/pages/GameBoard.tsx`

### Step 4: Apply auto-sort in server `manipulateBoard`

In `packages/server/src/game.ts`, before the `isValidBoard` check on line 157, sort all sets:

```
import { sortSetTiles } from "@rummikub/shared";

// Before isValidBoard check:
const sortedBoard = newBoard.map(set => ({
  ...set,
  tiles: sortSetTiles(set.tiles),
}));
```

Then use `sortedBoard` for validation and all subsequent logic.

**Files**: `packages/server/src/game.ts`

### Step 5: Add e2e tests

Add the e2e tests described above (TC-59 through TC-64) to `packages/qa/tests/manipulation.spec.ts`.

**Files**: `packages/qa/tests/manipulation.spec.ts`

### Step 6: Update server `endTurnWithBoard`

The `endTurnWithBoard` method (game.ts:268-273) calls `manipulateBoard` which already sorts, so no additional change needed here. Verify this is the case.

## Affected Files and Packages

| File | Package | Change |
|------|---------|--------|
| `packages/shared/src/validation.ts` | shared | Add `sortSetTiles` function |
| `packages/shared/src/index.ts` | shared | Export `sortSetTiles` |
| `packages/shared/src/validation.test.ts` | shared | Add unit tests for `sortSetTiles` |
| `packages/client/src/pages/GameBoard.tsx` | client | Call `sortSetTiles` after tile placement |
| `packages/server/src/game.ts` | server | Call `sortSetTiles` before board validation |
| `packages/qa/tests/manipulation.spec.ts` | qa | Add e2e tests TC-59 through TC-64 |

## Manual Validation Steps

1. Start a game, make initial meld
2. Add a tile to the beginning of a run — verify it auto-sorts to the correct position
3. Add a tile to the end of a run — verify it stays in the correct position
4. Add a tile to the middle of a run (by clicking a non-adjacent tile) — verify it auto-sorts
5. Add a tile to a group — verify no reordering occurs
6. Verify undo still works correctly after auto-sort

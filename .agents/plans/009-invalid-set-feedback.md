# Plan 009: Descriptive validation feedback for invalid sets

## Goal and Scope

When a player tries to end their turn with an invalid board state, they currently see a generic error message: "Board has invalid sets. Fix or undo before ending turn." This provides no help in understanding *which* sets are invalid or *why*. This feature adds:

1. **Real-time highlighting** of invalid sets on the board while the player is manipulating tiles, so they can see problems as they work.
2. **Per-set descriptive error messages** explaining why each invalid set fails validation (e.g., "Run has a gap — expected 6 between 5 and 7", "Group cannot have duplicate colors").
3. **Structured validation data** in the shared package so both client and server can produce these detailed reasons.

**Scope:**
- Add `getSetValidationError` and `getBoardValidationErrors` to the shared package
- Highlight invalid sets with a red border/glow on the client board
- Show a brief error label below each invalid set
- Replace the generic "Board has invalid sets" end-turn error with a per-set breakdown
- Improve server `move:rejected` messages for invalid sets (structured)

**Out of scope:**
- Valid move highlighting (showing where tiles *can* go) — separate Phase 3 item
- Changing how tile placement/dragging works
- Auto-fixing or suggesting fixes

## Acceptance Criteria

1. Invalid sets on the working board are visually highlighted with a red border/glow
2. Each invalid set shows a brief error message below it explaining why it's invalid
3. When the user clicks "End Turn" with invalid sets, the error display focuses on the invalid sets (no generic toast)
4. The following validation reasons are supported:
   - Set has fewer than 3 tiles
   - Group has more than 4 tiles
   - Run has mixed colors (non-joker tiles are different colors)
   - Run has a non-consecutive gap (with values shown)
   - Group has mixed values (non-joker tiles have different values)
   - Group has duplicate colors
   - All-joker set (no anchor tile)
   - General invalid (doesn't qualify as run or group)
5. Valid sets are not highlighted or annotated
6. Server `move:rejected` events for invalid sets include structured per-set errors
7. Existing tests continue to pass

## Edge Cases

1. **Set with fewer than 3 tiles during manipulation**: This happens when a user removes a tile from a set of 3, leaving 2 tiles. The set is invalid but this is an expected in-progress state. Show "Needs at least 3 tiles" with the red highlight so the user knows they need to add more tiles.
2. **Ambiguous set** (could be intended as run or group): If non-joker tiles share neither color nor value, report as "not a valid run or group" rather than guessing intent.
3. **Set that's close to valid** (e.g., run with a single gap): Report the specific gap, e.g., "Run has a gap: expected 6 between 5 and 7".
4. **Joker-heavy sets**: A set with 2 jokers and 1 tile is valid. A set with 2 jokers and 0 tiles is invalid. A set with 2 jokers and 2 tiles might be a valid group (if the 2 non-joker tiles have same value, different color) or an invalid group (if colors match).
5. **Empty board**: No sets to validate, no errors shown — this is fine.
6. **All sets valid**: No highlights, no errors, end turn proceeds normally.

## E2E Tests

All new tests go in `packages/qa/tests/turn-controls.spec.ts` and `packages/qa/tests/manipulation.spec.ts`.

### turn-controls.spec.ts

- **TC-65**: Ending turn with an invalid set shows per-set error descriptions
  - Seed: game in progress, player has initial meld, board has a valid set
  - Player manipulates board to create an invalid set (e.g., remove a tile from a 3-tile run, leaving 2)
  - Click "End Turn"
  - Verify: error messages appear near/below the invalid set(s), not just a generic toast
  - Verify: each invalid set has a red border/glow

- **TC-66**: Valid sets are not highlighted
  - Seed: game in progress, board has valid sets
  - Verify: no red borders, no error labels on any set

### manipulation.spec.ts

- **TC-67**: Removing a tile from a run highlights the remaining tiles as invalid
  - Seed: board has `[red-3, red-4, red-5]`, player has initial meld
  - Player moves red-5 out of the set (to form a new set elsewhere or back to rack)
  - If the remaining 2-tile set is left on the board, verify it shows "Needs at least 3 tiles"

- **TC-68**: Real-time highlighting updates as tiles are rearranged
  - Seed: board has `[red-3, red-4, red-6]` (invalid run — gap at 5)
  - Verify: the set shows an error about the gap (e.g., "Gap: expected 5 between 4 and 6")
  - Player adds `red-5` from rack to fill the gap
  - Verify: set no longer shows as invalid

- **TC-69**: Multiple invalid sets each show their own error
  - Seed: board has two invalid sets (e.g., a broken run and a group with duplicate colors)
  - Verify: each set has its own distinct error message

- **TC-70**: Group with duplicate colors shows error message
  - Seed: board has `[red-7, red-7, blue-7]` (duplicate red)
  - Verify: error mentions "duplicate color"

## Implementation Steps

### Step 1: Add `SetValidationReason` type and `getSetValidationError` function to shared

Add to `packages/shared/src/validation.ts`:

```typescript
export type SetValidationReason =
  | "too_few_tiles"
  | "too_many_tiles"
  | "run_mixed_colors"
  | "run_non_consecutive"
  | "group_mixed_values"
  | "group_duplicate_colors"
  | "all_jokers"
  | "not_valid";

export const SET_ERROR_MESSAGES: Record<SetValidationReason, string> = {
  too_few_tiles: "Needs at least 3 tiles",
  too_many_tiles: "Group cannot have more than 4 tiles",
  run_mixed_colors: "All tiles in a run must be the same color",
  run_non_consecutive: "Run must have consecutive values",
  group_mixed_values: "All tiles in a group must have the same value",
  group_duplicate_colors: "Group cannot have duplicate colors",
  all_jokers: "Set must contain at least one non-joker tile",
  not_valid: "Not a valid run or group",
};

export interface SetValidationError {
  setId: string;
  reason: SetValidationReason;
  message: string;
}
```

`getSetValidationError(tiles: Tile[], setId: string): SetValidationError | null`:
- Returns `null` if the set is valid (passes `isValidSet`)
- Otherwise returns the most specific reason why it fails:
  1. If `< MIN_SET_SIZE` → `too_few_tiles`
  2. If `> MAX_GROUP_SIZE` → `too_many_tiles`
  3. If all jokers → `all_jokers`
  4. Check if it could be a run: if non-joker tiles share same color, run `validateRunDetails`:
     - If non-consecutive → `run_non_consecutive`
     - If mixed colors → `run_mixed_colors` (shouldn't happen here since we pre-checked)
  5. Check if it could be a group: if non-joker tiles share same value, run `validateGroupDetails`:
     - If mixed values → `group_mixed_values`
     - If duplicate colors → `group_duplicate_colors`
  6. Otherwise → `not_valid`

`validateRunDetails(tiles: Tile[])`: Returns specific reason a run fails (used after confirming same-color). Checks for gaps in consecutive values.

`validateGroupDetails(tiles: Tile[])`: Returns specific reason a group fails (used after confirming same-value). Checks for duplicate colors.

Export these from `packages/shared/src/index.ts`.

**Files**: `packages/shared/src/validation.ts`, `packages/shared/src/index.ts`, `packages/shared/src/types.ts`

### Step 2: Add `getBoardValidationErrors` function to shared

```typescript
export function getBoardValidationErrors(board: TileSet[]): SetValidationError[] {
  const errors: SetValidationError[] = [];
  for (const set of board) {
    const error = getSetValidationError(set.tiles, set.id);
    if (error) errors.push(error);
  }
  return errors;
}
```

Export from `packages/shared/src/index.ts`.

**Files**: `packages/shared/src/validation.ts`, `packages/shared/src/index.ts`

### Step 3: Write unit tests for `getSetValidationError` and `getBoardValidationErrors`

Add tests in `packages/shared/src/validation.test.ts`:

- Valid run returns null
- Valid group returns null
- Set with 2 tiles returns `too_few_tiles`
- Set with 5 tiles returns `too_many_tiles`
- All-joker set returns `all_jokers`
- Run with mixed colors returns `run_mixed_colors`
- Run with a gap returns `run_non_consecutive`
- Group with mixed values returns `group_mixed_values`
- Group with duplicate colors returns `group_duplicate_colors`
- Set that is neither a valid run nor group returns `not_valid`
- `getBoardValidationErrors` returns errors only for invalid sets
- `getBoardValidationErrors` returns empty array for a valid board

**Files**: `packages/shared/src/validation.test.ts`

### Step 4: Update `TileSetComponent` to accept and display validation errors

In `packages/client/src/components/GameBoard.tsx`:

Add an optional `validationError` prop to `TileSetComponent`:

```typescript
export function TileSetComponent({
  tileSet,
  selectedTileId,
  onTileClick,
  validationError,
}: {
  tileSet: TileSet;
  selectedTileId?: string | null;
  onTileClick?: (tileId: string) => void;
  validationError?: string | null;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${
      validationError ? "ring-2 ring-red-500 bg-red-900/30" : "bg-gray-700/50"
    } p-2 rounded`}>
      <div className="flex gap-1">
        {tileSet.tiles.map((tile) => (...))}
      </div>
      {validationError && (
        <span className="text-red-400 text-xs">{validationError}</span>
      )}
    </div>
  );
}
```

**Files**: `packages/client/src/components/GameBoard.tsx`

### Step 5: Compute validation errors in `GameBoard.tsx` and pass to `Board`

In `packages/client/src/pages/GameBoard.tsx`:

- Import `getBoardValidationErrors`, `SET_ERROR_MESSAGES` from `@rummikub/shared`
- Compute `boardErrors` from `workingBoard ?? serverBoard` when it's the current player's turn and they have changes
- Build a `Map<string, string>` mapping set IDs to error messages
- Pass this map down to `Board` and `TileSetComponent`
- Update the `handleEndTurn` validation: instead of just `isValidBoard(workingBoard)`, use `getBoardValidationErrors(workingBoard)` and display the per-set errors

Update `Board` component prop types to accept `validationErrors: Map<string, string>` and pass to each `TileSetComponent`.

**Files**: `packages/client/src/pages/GameBoard.tsx`, `packages/client/src/components/GameBoard.tsx`

### Step 6: Update `handleEndTurn` to show per-set errors instead of generic message

In `packages/client/src/pages/GameBoard.tsx`, update the `handleEndTurn` function:

Replace the generic error:
```typescript
if (!isValidBoard(workingBoard)) {
  setError("Board has invalid sets. Fix or undo before ending turn.");
  return;
}
```

With per-set validation:
```typescript
const boardErrors = getBoardValidationErrors(workingBoard);
if (boardErrors.length > 0) {
  setError(`${boardErrors.length} invalid set${boardErrors.length > 1 ? 's' : ''}. Check highlighted sets.`);
  return;
}
```

The per-set error messages are already visible on the board itself (from Step 5), so the global error just needs to point the user to look at the board.

**Files**: `packages/client/src/pages/GameBoard.tsx`

### Step 7: Update server `manipulateBoard` error for invalid board

In `packages/server/src/game.ts`, update the `manipulateBoard` method (line 163):

Instead of throwing `"Resulting board has invalid sets"`, compute the specific errors and include them in the error message:

```typescript
const boardErrors = getBoardValidationErrors(sortedBoard);
if (boardErrors.length > 0) {
  const details = boardErrors.map(e => e.message).join("; ");
  throw new Error(`Invalid sets: ${details}`);
}
```

Similarly update `playSets` (line 136-138) to include a more specific error:

```typescript
for (const set of sets) {
  const error = getSetValidationError(set.tiles, set.id);
  if (error) {
    throw new Error(`Invalid set: ${error.message}`);
  }
}
```

**Files**: `packages/server/src/game.ts`

### Step 8: Add e2e tests

Add the e2e tests described above (TC-65 through TC-70) to the relevant test files.

**Files**: `packages/qa/tests/turn-controls.spec.ts`, `packages/qa/tests/manipulation.spec.ts`

### Step 9: Update documentation

#### 9a. Update `docs/prd.md` — Functional Requirements and Milestones

1. **Add F-14.1** to section 3.2 (Gameplay), right after F-14:

> | F-14.1 | When board validation fails, invalid sets are highlighted on the board with a red border and a descriptive error label explaining why each set is invalid (e.g., "Needs at least 3 tiles", "Run must have consecutive values", "Group cannot have duplicate colors") |

2. **Update Phase 3 milestone checklist** — add a new item for this feature and mark it as planned:

Change:
```
- [ ] Valid move highlighting
```
To:
```
- [ ] Invalid set feedback (highlighting + descriptive error messages per set)
- [ ] Valid move highlighting
```

#### 9b. Update `docs/entities.md` — Add SetValidationError entity

Add a new row to the Entities table:

> | **SetValidationError** | A structured validation error for an invalid tile set. Contains the set ID, a machine-readable reason code (`SetValidationReason`), and a human-readable message. Produced by `getSetValidationError` and `getBoardValidationErrors` in the shared package. |

Add a new row to the Relationships table:

> | Board validation → SetValidationError | 1:0..N | A board validation produces zero or more errors, one per invalid set. |

#### 9c. No changes needed to `README.md`

The README lists documentation files but does not enumerate all types or functions. The new types are in the shared package and will be discovered via `docs/prd.md` and `docs/entities.md`.

**Files**: `docs/prd.md`, `docs/entities.md`

## Affected Files and Packages

| File | Package | Change |
|------|---------|--------|
| `packages/shared/src/validation.ts` | shared | Add `SetValidationReason`, `SET_ERROR_MESSAGES`, `SetValidationError`, `getSetValidationError`, `validateRunDetails`, `validateGroupDetails`, `getBoardValidationErrors` |
| `packages/shared/src/types.ts` | shared | Add `SetValidationReason`, `SetValidationError` type exports |
| `packages/shared/src/index.ts` | shared | Export new functions and types |
| `packages/shared/src/validation.test.ts` | shared | Add unit tests for new validation functions |
| `packages/client/src/components/GameBoard.tsx` | client | Add `validationError` prop to `TileSetComponent`; conditional red styling |
| `packages/client/src/pages/GameBoard.tsx` | client | Compute and pass `validationErrors` map; update `handleEndTurn` error display |
| `packages/server/src/game.ts` | server | Use `getSetValidationError`/`getBoardValidationErrors` for specific error messages |
| `packages/qa/tests/turn-controls.spec.ts` | qa | Add TC-65, TC-66 |
| `packages/qa/tests/manipulation.spec.ts` | qa | Add TC-67, TC-68, TC-69, TC-70 |
| `docs/prd.md` | — | Add F-14.1; add invalid set feedback to Phase 3 checklist |
| `docs/entities.md` | — | Add SetValidationError entity and relationship |

## Manual Validation Steps

1. Start a game, make initial meld (30+ points)
2. During board manipulation, remove a tile from a 3-tile run — verify the remaining 2-tile set gets a red border and shows "Needs at least 3 tiles"
3. Create a set with mixed colors that could be a run (e.g., red-3, blue-4, red-5) — verify it shows "All tiles in a run must be the same color"
4. Create a set that's close to a valid run but has a gap (e.g., red-3, red-4, red-6) — verify it shows "Run must have consecutive values"
5. Create a group with duplicate colors (e.g., red-7, red-7, blue-7) — verify it shows "Group cannot have duplicate colors"
6. Click "End Turn" with invalid sets — verify the error message references the invalid sets and the sets are visually highlighted
7. Fix all invalid sets — verify the red highlighting disappears
8. End turn with all valid sets — verify it succeeds with no error
9. Verify that undo removes both the board changes AND the error highlights
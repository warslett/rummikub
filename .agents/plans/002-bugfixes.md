# Plan: Fix Phase 1 Bugs

## Bug 1: Duplicate sets on board during turn

**Root cause:** In `GameBoard.tsx`, `handlePlay` optimistically adds sets to `pendingSets` (line 75), then the board is rendered as `[...gameState.board, ...pendingSets]` (line 90). After `turn:play`, the server sends back `game:state` with the updated board (which already includes the played sets), so the sets appear twice — once from `gameState.board` and once from `pendingSets`.

When a play is rejected, the optimistic `pendingSets` still contains the invalid set. It only clears on draw/end turn, so the invalid set briefly appears on the board.

**Fix:** Remove the `pendingSets` mechanism entirely. The server already sends updated state after each `turn:play`, so the client can rely on `gameState.board` alone. This eliminates both the duplication and the stale optimistic update on rejection.

**Affected files:**
- `packages/client/src/pages/GameBoard.tsx` — remove `pendingSets` state and the `allBoardSets` merge; render `gameState.board` directly; clear `handlePlay` of the optimistic add; clear `handleEndTurn`/`handleDraw` of the `setPendingSets([])` calls

## Bug 2: End Turn / Draw Tile button logic

**Root cause:** The `Controls` component always shows both buttons as active during a player's turn, regardless of whether they've played this turn.

**Rummikub rules:** On each turn you must either (a) play at least one set then end your turn, or (b) draw a tile. You cannot do both. You cannot end your turn without having played.

**Fix:** Add `hasPlayedThisTurn` state to the `GameBoard` page, pass it to `Controls`. Disable "End Turn" when no play has been made. Disable "Draw Tile" when a play has been made. Reset `hasPlayedThisTurn` when turn changes (detect via `gameState.isYourTurn` going from true to false, or clear on draw/end).

**Affected files:**
- `packages/client/src/pages/GameBoard.tsx` — add `hasPlayedThisTurn` state, set to `true` after successful play, reset when turn changes
- `packages/client/src/components/GameBoard.tsx` — add `hasPlayedThisTurn` prop to `Controls`, disable buttons accordingly

## Bug 3: Multiple sets for initial meld across separate plays

**Root cause:** In `game.ts:playSets`, the initial meld check only considers the sets in the current `playSets` call (line 112). If a player makes two separate `turn:play` calls within the same turn — e.g., first a 30-point run, then a 9-point group — the second call fails because it checks only its own 9 points against the 30-point minimum, even though the cumulative turn total is 39.

`hasInitialMeld` is only set in `endTurn`, so between plays within the same turn, the player is still subject to the per-call check.

**Fix:** Change the initial meld check in `playSets` to consider the cumulative value of ALL sets placed this turn (from `turnActions`) PLUS the new sets being played. If the cumulative total meets the 30-point minimum, allow the play. This lets a player make multiple small plays that together satisfy the initial meld requirement.

**Affected files:**
- `packages/server/src/game.ts` — update `playSets` to compute cumulative turn value from `turnActions` + new sets for the initial meld check
- `packages/server/src/game.test.ts` — add tests for cumulative initial meld scenarios

## Bug 4: Invalid tile selection gives no feedback

**Root cause:** The "Play Selected" button is enabled whenever 3+ tiles are selected (`selectedCount >= 3`). However, `handlePlay` may fail to form any valid sets from the selection (e.g., three tiles of different colors and values) and silently returns at line 71. The user sees an active button that does nothing when clicked.

**Fix:** When `handlePlay` produces zero valid sets from the selection, display an error message (e.g., "Selected tiles don't form a valid set"). Reuse the same error display mechanism used for server-side move rejections.

**Affected files:**
- `packages/client/src/pages/GameBoard.tsx` — add error state, set it when no valid sets are formed, clear it on next selection change or after a timeout

---

## Implementation Steps (TDD)

### Step 1: Bug 3 — Server fix (cumulative initial meld)

1. **Write failing test:** Test that a player can make two separate `playSets` calls in the same turn where neither alone reaches 30 but together they do (e.g., play a run of 8-9-10 = 27, then play a group of 1-1-1 = 3, cumulative = 30). Also test that a single play under 30 is still rejected if no prior plays exist this turn.
2. **Run test — observe failure.**
3. **Fix `playSets`:** Compute cumulative value from existing `turnActions` of type `placeSet` plus the new sets. Use this cumulative value for the initial meld check.
4. **Run test — observe pass.**
5. **Run all server tests.**

### Step 2: Bug 1 — Client fix (remove pendingSets)

1. **No new test needed** — this is a UI rendering bug; manual validation will confirm the fix.
2. **Edit `GameBoard.tsx`:** Remove `pendingSets` state. Render `gameState.board` directly instead of `allBoardSets`. Remove `setPendingSets` calls from `handlePlay`, `handleEndTurn`, `handleDraw`.
3. **Manual validation:** Play a set — confirm it appears once. Play an invalid set — confirm nothing appears on the board.

### Step 3: Bug 4 — Client fix (invalid selection feedback)

1. **No new test needed** — UI feedback fix; manual validation will confirm.
2. **Edit `GameBoard.tsx`:** Add `error` state. In `handlePlay`, when `sets.length === 0`, set error to "Selected tiles don't form a valid set". Clear the error when tiles are deselected/selected (in `toggleSelect`) or after a timeout (3 seconds). Display the error in the UI near the controls.
3. **Manual validation:** Select 3 tiles that don't form any valid set, click "Play Selected" — confirm error message appears. Select different tiles — confirm error clears.

### Step 4: Bug 2 — Client fix (button enablement logic)

1. **No new test needed** — UI behavior fix; manual validation will confirm.
2. **Edit `GameBoard.tsx`:** Add `hasPlayedThisTurn` state. Set to `true` after a successful `turn:play`. Reset to `false` when `gameState.isYourTurn` transitions from true to false (i.e., it's no longer your turn). Also reset on draw. Pass `hasPlayedThisTurn` to `Controls`.
3. **Edit `GameBoard.tsx` (Controls component):** Add `hasPlayedThisTurn` prop. Disable "End Turn" when `!hasPlayedThisTurn`. Disable "Draw Tile" when `hasPlayedThisTurn`.
4. **Manual validation:** Confirm "End Turn" is disabled until a play is made. Confirm "Draw Tile" is disabled after a play is made. Confirm buttons reset correctly on turn change.

### Step 5: Run full test suite

Run `npm test` from root to ensure all tests pass.

### Step 6: Update QA document

Add test cases to `qa/phase1.md` covering the four bugs:
- TC for duplicate sets no longer appearing after a play
- TC for "End Turn" disabled until a play is made
- TC for "Draw Tile" disabled after a play is made
- TC for cumulative initial meld across multiple plays in a single turn
- TC for invalid tile selection showing an error message
- TC for error message clearing when selection changes

### Step 7: Manual smoke test

Follow the relevant test cases from `qa/phase1.md` (especially TC-13, TC-14, TC-17, TC-18) to confirm all three bugs are resolved.

---

## Edge Cases

- Player makes 3+ separate plays in one turn, each under 30 but cumulative ≥ 30 — should succeed
- Player's first play in a turn is exactly 30, second play is any valid set — should succeed
- Player's first play is under 30 and no prior plays this turn — should still be rejected (same-turn cumulative is also under 30)
- After drawing, `hasPlayedThisTurn` resets (even though it's now opponent's turn, the state should be clean for when it's your turn again)
- "End Turn" with no plays made — button disabled, cannot be clicked
- "Draw Tile" after making a play — button disabled, cannot be clicked
- Selecting 3+ tiles that don't form any valid set and clicking "Play Selected" — error message displayed
- Error message clears when the user changes their tile selection

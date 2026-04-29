# Phase 2 Fixup: Quality Issues

## Goal

Address quality gaps from the Phase 2 implementation before they become entrenched.

## Issues

### Issue 1: E2E Tests Are Shallow

The plan specified detailed Playwright tests (TC-28 through TC-51) covering manipulation flows, joker scenarios, stalemate, scoring, and reconnection. The current `phase2.spec.ts` is mostly smoke tests that verify UI renders but don't exercise actual gameplay through the browser.

**Affected file:** `packages/qa/tests/phase2.spec.ts`

**Fix:** Replace with proper E2E tests. Key challenge: manipulation and joker scenarios depend on specific tile distributions, which are randomized. Two approaches:
- **Approach A (recommended):** Add a server API or Socket.IO event to seed a game with a specific tile distribution for testing. This is a small addition to `packages/server/src/handlers.ts` and `packages/server/src/game.ts` — a `game:seed` handler that sets up a known state.
- **Approach B:** Use only the server unit tests for deterministic game logic coverage, and keep E2E tests for UI flows that don't depend on specific tiles (draw, turn alternation, disconnect notification, pass when pool empty, play again).

Regardless of approach, the following E2E tests should be properly implemented:

- TC-28–TC-35: Board manipulation (requires seeded games)
- TC-36–TC-41: Joker handling (requires seeded games)
- TC-42–TC-43: Cumulative scoring and Play Again (requires completing a game)
- TC-44–TC-45: Disconnect/reconnect notification (can be done without seeding)
- TC-46–TC-49: Stalemate (requires draining pool)
- TC-50–TC-51: Games-won tracking (requires multiple rounds)

### Issue 2: `endTurn` + `manipulateBoard` Race Condition

In `packages/client/src/pages/GameBoard.tsx`, `handleEndTurn` emits `turn:manipulate` and then immediately emits `turn:end`:

```ts
socket.emit("turn:manipulate", { newBoard: workingBoard });
// ...
socket.emit("turn:end", {});
```

If `turn:manipulate` fails server-side (e.g., invalid board after server-side validation), the `turn:end` still fires and will either fail or apply an incorrect state.

**Affected file:** `packages/client/src/pages/GameBoard.tsx`

**Fix:** Sequence the two calls. After emitting `turn:manipulate`, wait for either `game:state` (success) or `move:rejected` (failure) before deciding whether to emit `turn:end`. Options:
- **Option A:** Use Socket.IO acknowledgements (callback-based). Change `turn:manipulate` handler to send an ack on success/failure, then only emit `turn:end` on success.
- **Option B:** Emit a single combined `turn:end` event that includes the new board state when manipulation occurred. The server handles both steps atomically. This is cleaner and eliminates the race entirely.

**Recommendation:** Option B. Add an optional `newBoard` field to the `turn:end` event. If present, the server applies manipulation + endTurn atomically. Remove the separate `turn:manipulate` + `turn:end` two-step from the client.

### Issue 3: Joker Display Resolution Incomplete

`resolveJokerValue` in `@rummikub/shared` works for simple cases, but:
- After manipulation, the client may not reliably know which set a joker belongs to for display
- `resolveJokerValue` only works correctly if the set is a valid run or group — if the board has pending invalid sets in the working copy, display breaks
- The function tries `isValidRun` then `isValidGroup` — ambiguous cases (3 tiles with same value but also consecutive) could resolve incorrectly

**Affected files:** `packages/shared/src/validation.ts`, `packages/client/src/components/GameBoard.tsx`

**Fix:**
1. In `resolveJokerValue`, when a set passes both `isValidRun` and `isValidGroup`, prefer the interpretation based on the set's context. For groups (all same value), the joker value equals that value. For runs (consecutive same-color), the position determines the value. The current logic tries run first, which is correct for most cases but fails for ambiguous 3-tile sets like `[red-5, joker, black-5]` — which is a group, not a run.
2. In the client, guard the display value: only call `resolveJokerValue` when the set is known-valid. In the working copy during editing, show `★` for jokers in incomplete/invalid sets instead of trying to resolve.

### Issue 4: Client-Side Validation Gaps

The client's `handleEndTurn` checks `isValidBoard` but doesn't enforce:
- Joker retrieval requires at least one rack tile played
- Freed jokers must be used in the same turn
- Cannot manipulate before initial meld

These all get caught server-side, but the user experience is poor — they get a `move:rejected` error after submitting instead of immediate feedback.

**Affected file:** `packages/client/src/pages/GameBoard.tsx`

**Fix:** Add client-side pre-validation in `handleEndTurn` before emitting to the server:
1. If `!hasInitialMeld` and board differs from server board, show "Cannot manipulate before initial meld"
2. Track freed jokers (jokers on server board whose set has changed) and verify they appear in the working board
3. If jokers were freed, verify at least one rack tile was placed on the board

These checks mirror the server logic in `game.ts:manipulateBoard` and `game.ts:wasJokerRetrieved`.

## Implementation Steps

### Step 1: Fix endTurn race condition (Issue 2)

**Design:** Add optional `newBoard` to `turn:end`. Server processes atomically.

1. Update `packages/server/src/handlers.ts` — `turn:end` handler accepts `{ newBoard?: TileSet[] }`. If `newBoard` provided and player has initial meld, call `manipulateBoard` then `endTurn`. If manipulation fails, return error without ending turn.
2. Update `packages/client/src/pages/GameBoard.tsx` — `handleEndTurn` sends `{ newBoard }` in a single `turn:end` emit. Remove separate `turn:manipulate` emit.
3. Update `packages/server/src/game.ts` — add `endTurnWithBoard(playerId, newBoard?)` that combines manipulation + end turn atomically.
4. **Test:** Server unit test for `endTurnWithBoard` — success case, invalid board rejection, initial meld rejection.

### Step 2: Fix joker display (Issue 3)

1. Update `packages/shared/src/validation.ts` — improve `resolveJokerValue` to handle ambiguous sets. Check `isValidGroup` first (it's more restrictive), then `isValidRun`.
2. Update `packages/client/src/components/GameBoard.tsx` — guard `getJokerDisplayValue` to only resolve when the full set is valid. Fall back to `★`.
3. **Test:** Add shared validation tests for ambiguous joker cases (e.g., `[red-5, joker, black-5]` should resolve as group with value 5).

### Step 3: Add client-side pre-validation (Issue 4)

1. Update `packages/client/src/pages/GameBoard.tsx` — add pre-validation in `handleEndTurn`:
   - Check initial meld restriction
   - Check freed joker usage
   - Check rack tile requirement for joker retrieval
2. **Test:** Manual verification — try each invalid scenario and confirm immediate client feedback.

### Step 4: Add game seeding for E2E (Issue 1 — prerequisite)

1. Add `game:seed` handler in `packages/server/src/handlers.ts` — accepts `{ gameCode, state }` and sets up a game with known tile distribution. Only enabled when `NODE_ENV === 'test'`.
2. Add `seedGame(state)` method to `packages/server/src/game.ts` — sets board, racks, pool, phase, hasInitialMeld.
3. **Test:** Unit test for `seedGame`.

### Step 5: Rewrite E2E tests (Issue 1)

Replace `packages/qa/tests/phase2.spec.ts` with proper tests using seeded games:

1. **manipulation.spec.ts**: TC-28–TC-35. Seed a game with a board containing `[red-10, red-11, red-12]` and rack with `[red-9, ...]`. Test extending the run, splitting runs, substituting tiles, invalid manipulation, manipulation before initial meld, undo.
2. **jokers.spec.ts**: TC-36–TC-41. Seed with joker tiles on board and in rack. Test playing joker, retrieving joker, freed joker must be used, no rack tile rejection, joker penalty in scoring.
3. **scoring.spec.ts**: TC-42–TC-43, TC-50–TC-51. Seed a near-end game, play to completion, verify scores. Click Play Again, verify cumulative scores and games-won.
4. **reconnection.spec.ts**: TC-44–TC-45. Disconnect one player's context, verify opponent sees notification. Reconnect, verify state restored.
5. **stalemate.spec.ts**: TC-46–TC-49. Seed a game with empty pool and small racks. Both pass, verify game ends with correct stalemate scoring.

Each test should use the `game:seed` handler to set up deterministic state.

## Affected Files

- `packages/shared/src/validation.ts` — joker resolution fix
- `packages/shared/src/validation.test.ts` — ambiguous joker tests
- `packages/server/src/game.ts` — `endTurnWithBoard`, `seedGame`
- `packages/server/src/game.test.ts` — tests for new methods
- `packages/server/src/handlers.ts` — `turn:end` with newBoard, `game:seed`
- `packages/client/src/pages/GameBoard.tsx` — single emit endTurn, pre-validation
- `packages/client/src/components/GameBoard.tsx` — guarded joker display
- `packages/qa/tests/phase2.spec.ts` — replace with proper tests
- `packages/qa/tests/manipulation.spec.ts` — new
- `packages/qa/tests/jokers.spec.ts` — new
- `packages/qa/tests/scoring.spec.ts` — new
- `packages/qa/tests/reconnection.spec.ts` — new
- `packages/qa/tests/stalemate.spec.ts` — new

## Validation Steps

1. `npm test --workspace=packages/shared` — all tests pass
2. `npm test --workspace=packages/server` — all tests pass
3. `npm run typecheck` — no errors
4. `npm run lint` — no errors
5. `npm run build` — all packages build
6. Manual smoke test: manipulate board, undo, play joker, retrieve joker, pass, play again
7. E2E tests pass with seeded games

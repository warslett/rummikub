# Phase 2: Core Gameplay

## Goal

Upgrade Rummikub from basic "play new sets only" to full gameplay: tile manipulation of existing board sets, undo within a turn, joker tiles with substitution/retrieval rules, cumulative scoring across rounds, reconnection support, disconnect notification, and stalemate detection.

## PRD References

- F-12: On their turn, a player can draw, play new sets, add to existing sets, manipulate existing sets, or any combination
- F-14: Server validates all moves before applying them
- F-15: A player can end their turn only when all board tiles form valid sets
- F-21–F-24: Scoring and cumulative scoring across rounds
- F-25–F-27: Reconnection and disconnect notification
- F-33: Inactive games expire after 24 hours
- Section 2.6: Manipulating existing sets
- Section 2.7: Invalid moves
- Section 2.9: Scoring (joker penalty: 30 points)

## Scope Decisions

- **Turn action model**: Client submits complete board state at end of turn. Server validates the entire resulting board. Client maintains a working copy during the turn for manipulation and undo.
- **Round continuation**: Same game code/room, scores carry over, new tiles dealt. "Play Again" button on game over screen.
- **Reconnection timeout**: Deferred to later phase. Phase 2 adds reconnection support and disconnect notification only.
- **Stalemate**: Per official rules — when pool is empty and no player can make a valid play, the game ends. Player with lowest **total rack value** (not fewest tiles) wins. Stalemate scoring differs from normal: each loser's score change = winner's rack total − loser's rack total (negative), winner gets the positive sum. Detected via consecutive passes (each player passes when they cannot/will not play and pool is empty).
- **Joker value in initial meld**: Per official rules — a joker used in the initial meld assumes the value of the tile it represents.
- **Joker retrieval requires rack tile**: Per official rules — when a player retrieves a joker, they must use at least one tile from their rack on that turn. This is NOT naturally enforced — a player could theoretically manipulate board tiles to free a joker without playing any rack tiles.
- **Games-won tracking**: Per official rules — the number of games each player has won is tracked across rounds. The overall winner is the player with the most game wins; ties are broken by highest cumulative score.

## Affected Packages

- `packages/shared` — types, constants, validation (joker-aware validation)
- `packages/server` — game state machine, handlers, reconnection logic
- `packages/client` — board manipulation UI, undo, joker tiles, "Play Again", reconnect, disconnect banner

## Implementation Steps

### Step 1: Shared — Add Joker Types and Constants

Extend types and constants for joker support.

**Test first, then implement:**

- `packages/shared/src/constants.ts` — add `JOKER_VALUE = 0`, `JOKER_COLOR = "joker"`, `JOKER_PENALTY = 30`, `JOKER_COUNT = 2`, update `TOTAL_TILES = 106`
- `packages/shared/src/types.ts` — add `TurnAction` variant for manipulation actions: `{ type: "manipulate" }` (board state is submitted whole, so we only track that manipulation occurred for undo). Update `TurnAction` to include `{ type: "pass" }` for stalemate. Add `RoundState` type for cumulative scoring.

**Tests:**
- Constants have correct values (106 total tiles, joker penalty 30, 2 jokers)

**Verification:** `npm test --workspace=packages/shared` passes

### Step 2: Shared — Joker-Aware Validation

Update validation functions to handle joker tiles in sets.

**Test first, then implement:**

- `packages/shared/src/validation.ts` — update `isValidRun` and `isValidGroup` to accept jokers. A joker in a run represents the missing consecutive value. A joker in a group represents a missing color. Two jokers can appear in the same set. Add `resolveJokerValue(tile, set)` helper that returns the numeric value a joker represents in context.
- Add `isValidBoard(board: TileSet[]): boolean` — validates that all sets on the board are valid and no tiles are orphaned.

**Tests (`packages/shared/src/validation.test.ts`):**
- `isValidRun` with joker in the middle: `[red-3, joker, red-5]` → valid (joker = red-4)
- `isValidRun` with joker at start: `[joker, red-4, red-5]` → valid (joker = red-3)
- `isValidRun` with joker at end: `[red-3, red-4, joker]` → valid (joker = red-5)
- `isValidRun` with two jokers: `[red-3, joker, joker, red-6]` → valid
- `isValidRun` rejects if joker(s) would need value > 13 or < 1
- `isValidRun` rejects two jokers that can't both fit in the run
- `isValidGroup` with joker: `[red-7, joker, black-7]` → valid (joker = blue-7 or orange-7)
- `isValidGroup` with joker replacing duplicate color → valid
- `isValidGroup` rejects two jokers in a 3-tile group (would only leave 1 real tile, which can't represent 2 distinct colors) — actually 2 jokers + 1 real = 3 tiles, could be valid (joker fills 2 missing colors)
- `isValidGroup` with two jokers and two real tiles = 4 tiles → valid
- `isValidBoard` — all valid sets → true
- `isValidBoard` — any invalid set → false
- `calculateSetValue` — joker contributes its resolved value (for initial meld), not 0

**Verification:** `npm test --workspace=packages/shared` passes

### Step 3: Shared — Tile Generation with Jokers

Update tile generation to include 2 joker tiles.

**Test first, then implement:**

- `packages/shared/src/tiles.ts` — update `generateAllTiles()` to include 2 joker tiles (id: `joker-1`, `joker-2`, color: `"joker"`, value: `0`)
- Update `TOTAL_NUMBERED_TILES` to `TOTAL_TILES = 106`

**Tests (`packages/shared/src/tiles.test.ts`):**
- `generateAllTiles` returns 106 tiles
- Includes 2 joker tiles with id `joker-1` and `joker-2`, color `"joker"`, value `0`
- Numbered tiles unchanged (104)

**Verification:** `npm test --workspace=packages/shared` passes

### Step 4: Server — Game State Machine: Turn Snapshot and Undo

Add turn snapshot mechanism for undo support. Before any action in a turn, save the board + rack state. "Undo" reverts to the snapshot.

**Test first, then implement:**

- `packages/server/src/game.ts` — add `turnSnapshot` field: `{ board: TileSet[], rack: Tile[] }` saved at the start of each turn. Add `undoTurn(playerId)` method that reverts board and rack to the snapshot. Modify `playSets` to work with snapshots (board state accumulates within a turn). Add `manipulateBoard(playerId, newBoard: TileSet[])` — player submits the entire new board state, server validates.

**Design for the "submit full board" model:**
1. When a turn starts, `turnSnapshot = { board: deepClone(board), rack: deepClone(player.rack) }`
2. Player can call `playSets` (place new sets from rack) — adds to board, removes from rack
3. Player can call `manipulateBoard` (submit modified board) — replaces board entirely, validates that:
   - All tiles on the new board exist either in the original snapshot board or in the player's current rack (no tile creation)
   - No tiles from the snapshot board are on the player's rack (can't take opponent tiles)
   - All sets on the new board are valid
   - All tiles accounted for: snapshot.board tiles + snapshot.rack tiles = newBoard tiles + newRack tiles
4. `undoTurn()` reverts board and rack to `turnSnapshot`
5. `endTurn()` validates the final board state and commits

**Tests (`packages/server/src/game.test.ts`):**
- Turn snapshot is created when a turn begins
- `undoTurn` reverts board and rack to start-of-turn state
- `undoTurn` rejects if not current player
- `undoTurn` can be called after `playSets` to revert
- `undoTurn` can be called after `manipulateBoard` to revert
- Multiple manipulations + undo returns to original state

**Verification:** `npm test --workspace=packages/server` passes

### Step 5: Server — Game State Machine: Board Manipulation

Implement `manipulateBoard` with full validation.

**Test first, then implement:**

- `packages/server/src/game.ts` — `manipulateBoard(playerId, newBoard)` method:
  - Validates all sets on `newBoard` are valid (using `isValidBoard`)
  - Computes the diff: tiles that were removed from the snapshot board, tiles that were added from the rack
  - Validates that every tile on the new board was either (a) already on the snapshot board, or (b) from the player's rack (from the snapshot)
  - Ensures no tile duplication (each tile ID appears exactly once)
  - Updates the board and player's rack accordingly
  - Stores the action in `turnActions`

**Tests (`packages/server/src/game.test.ts`):**
- Add a tile to an existing run (extend blue 3-4-5 to blue 2-3-4-5 with own blue 2)
- Remove a tile from the end of a long run (take red 7 from red 5-6-7-8-9, leaving 5-6-7-8 and red 9 for new set)
- Split a run (red 3-4-5-6-7 → red 3-4-5 + red 6-7 + own red 8)
- Substitute in a group (replace blue-7 with orange-7 in group of red-7, blue-7, black-7)
- Combined manipulation across multiple sets
- Reject if resulting board has invalid sets
- Reject if a set has fewer than 3 tiles
- Reject if tiles appear that weren't on the board or in player's rack
- Reject if player hasn't made initial meld and tries to manipulate
- After manipulation, player must still end turn (board is validated again at endTurn)

**Verification:** `npm test --workspace=packages/server` passes

### Step 6: Server — Game State Machine: Initial Meld with Manipulation

Ensure initial meld rules work correctly with the new model.

**Test first, then implement:**

- `packages/server/src/game.ts` — update `endTurn` to handle initial meld when manipulation occurred:
  - If `!player.hasInitialMeld` and any board manipulation happened this turn: reject (players cannot manipulate before initial meld — PRD section 2.6, official rules)
  - If `!player.hasInitialMeld` and only new sets were played: existing initial meld logic applies (cumulative ≥ 30 points from rack tiles only)
  - Joker values in initial meld: jokers contribute the value of the tile they represent

**Tests:**
- Player cannot manipulate board before initial meld
- Player CAN play joker in initial meld (joker counts as represented tile value)
- Initial meld with joker: joker as red-10 in run red-9-joker-red-11 counts as 30 (9+10+11)
- After initial meld, player can manipulate on subsequent turns

**Verification:** `npm test --workspace=packages/server` passes

### Step 7: Server — Game State Machine: Joker Handling

Implement joker-specific rules.

**Test first, then implement:**

- `packages/server/src/game.ts` — add joker validation in `manipulateBoard`:
   - **Joker substitution**: A player can replace a joker on the board with the tile it represents. The freed joker must be used in the same turn (must appear on the new board in a valid set).
   - **Cannot retrieve joker before initial meld**: If `!player.hasInitialMeld`, reject any turn action that would move a joker off the board.
   - **Joker must be played same turn**: If a joker was removed from a set, it must appear in a new set on the submitted board. Track which jokers were "freed" during the turn.
   - **Must use at least one rack tile when retrieving a joker**: Per official rules, a player who retrieves a joker must use at least one tile from their rack on that turn. This is NOT naturally enforced — a player could manipulate board tiles to free a joker without contributing from their rack. Track whether any rack tile was played this turn; if a joker was freed and no rack tile was used, reject the move.
- `packages/shared/src/validation.ts` — add `resolveJokerInSet(tile, setTiles)` that returns the value/color a joker represents given its position in a set.

**Tests (`packages/server/src/game.test.ts`):**
- Joker in a run: `[red-3, joker, red-5]` — joker represents red-4
- Joker at end of run: `[blue-10, blue-11, joker]` — joker represents blue-12
- Joker in a group: `[joker, black-5, orange-5]` — joker represents red-5 or blue-5
- Retrieve joker by replacing with the exact tile it represents
- Retrieve joker from a 3-tile group with either missing color
- Freed joker must be used in same turn (appear on new board)
- Reject if freed joker is not used in same turn
- Reject joker retrieval before initial meld
- **Reject if joker retrieved but no rack tile played this turn** (per official rules)
- Allow joker retrieval when at least one rack tile is also played this turn
- Joker penalty in scoring: joker on rack = 30 points
- Joker value in initial meld = value of tile it represents

**Verification:** `npm test --workspace=packages/server` passes

### Step 8: Server — Stalemate Detection

Implement pool-exhaustion stalemate per official rules.

**Test first, then implement:**

- `packages/server/src/game.ts` — add `passTurn(playerId)` method:
   - Can only be called when pool is empty
   - Records a pass in turn actions
   - Advances the turn
   - After a pass, check if both players have passed consecutively → game ends
- Add `checkStalemate()` — returns winner if both players passed consecutively
- **Stalemate scoring** (differs from normal win scoring):
   - Winner = player with lowest total rack value (joker = 30 points)
   - Each loser's score change = winner's rack total − loser's rack total (a negative number)
   - Winner's score change = positive sum of all losers' score changes
   - Example: Winner has 6 in rack, loser has 20. Loser gets 6−20 = −14. Winner gets +14.
- Normal scoring (from Phase 1) unchanged: winner gets sum of losers' rack values, losers subtract their own rack value
- Update `calculateScores` to handle both normal and stalemate paths, and joker penalty (joker on rack = 30 points)

**Tests:**
- `passTurn` when pool is not empty → reject
- `passTurn` when pool is empty → succeed, advance turn
- Two consecutive passes end the game
- Stalemate scoring: player with lowest total rack value wins (not fewest tiles)
- Stalemate scoring: loser's score = winner's rack total − loser's rack total (negative)
- Stalemate scoring: winner gets positive sum of losers' penalties
- Stalemate scoring with joker penalty (joker = 30)
- Normal win scoring still works (winner empties rack → gets sum of losers' values)
- Single pass does NOT end the game (only consecutive)
- Play after a pass resets the consecutive pass counter
- Drawing is still allowed when pool has tiles

**Verification:** `npm test --workspace=packages/server` passes

### Step 9: Server — Cumulative Scoring, Games-Won Tracking, and Play Again

Support multiple rounds with cumulative scores and games-won tracking.

**Test first, then implement:**

- `packages/server/src/game.ts` — add `roundNumber` and `gamesWon` (per-player count) fields to game state. Add `startNewRound()` method:
   - Validates game is in `ended` phase
   - Increments `gamesWon` for the winner of the just-ended game
   - Preserves cumulative scores and `gamesWon`
   - Resets `hasInitialMeld` for all players
   - Resets board, pool, racks, currentTurnIndex
   - Deals new tiles
   - Sets phase back to `playing`
- Update `PlayerGameState` to include `roundNumber` and `gamesWon`
- Update `GameEndedPayload` to include cumulative scores, games won, and round info
- Add `playAgain` event handler

**Tests:**
- `startNewRound` resets board and pool
- `startNewRound` preserves cumulative scores
- `startNewRound` increments games-won count for the winner
- `startNewRound` deals 14 tiles to each player
- `startNewRound` resets `hasInitialMeld` for all players
- Scores accumulate across rounds
- Games-won count persists across rounds
- Round number increments

**Verification:** `npm test --workspace=packages/server` passes

### Step 10: Server — Reconnection Support

Implement reconnection so disconnected players can rejoin.

**Test first, then implement:**

- `packages/server/src/game.ts` — add `reconnectPlayer(playerId)` method: sets `player.connected = true`
- `packages/server/src/handlers.ts` — add `game:reconnect` handler:
  - Accepts `{ gameCode, playerId }`
  - Looks up game, finds player, marks as connected
  - Sends current `game:state` to the reconnecting player
  - Emits `player:reconnected` to the room
  - Associates the new socket with the player (update `socket.data`)
- Update disconnect handler: mark player as disconnected, emit `player:disconnected`
- Store `playerId` in localStorage on the client so it persists across page reloads

**Tests (unit):**
- `reconnectPlayer` sets connected to true
- `reconnectPlayer` rejects if player not found

**Verification:** `npm test --workspace=packages/server` passes

### Step 11: Server — Inactivity Expiry

Clean up games that have been inactive for 24 hours.

**Implement (no TDD needed — this is a cleanup task, not game logic):**

- `packages/server/src/gameManager.ts` — add `cleanupExpiredGames()` method: iterates all games, removes those where `lastActivityAt` is more than 24 hours ago
- Call `cleanupExpiredGames()` periodically (e.g., every 10 minutes via `setInterval` in server startup)

**Verification:** Manual — create game, verify it's cleaned up after 24h (or test with short expiry)

### Step 12: Server — Update Socket.IO Handlers

Wire up all new events.

**Test first, then implement:**

- `packages/server/src/handlers.ts` — add handlers for:
  - `turn:manipulate` → calls `game.manipulateBoard`, sends updated state
  - `turn:undo` → calls `game.undoTurn`, sends reverted state
  - `turn:pass` → calls `game.passTurn`, checks stalemate
  - `game:playAgain` → calls `game.startNewRound`, broadcasts new state
  - `game:reconnect` → calls `game.reconnectPlayer`, sends state
- Update existing handlers for new game logic

**Tests:**
- `turn:manipulate` with valid board → state update
- `turn:manipulate` with invalid board → `move:rejected`
- `turn:undo` → board and rack revert
- `turn:pass` when pool empty → turn advances
- `turn:pass` when pool not empty → rejected
- `game:playAgain` → new round starts with cumulative scores
- `game:reconnect` → player marked connected, receives state

**Verification:** `npm test --workspace=packages/server` passes

### Step 13: Client — Board Manipulation UI

Allow the active player to manipulate tiles on the board during their turn.

**Implement (UI feature — manual validation):**

The core interaction model:

1. When it's your turn, you enter "editing mode" for the board
2. You can click a tile on the board to select it, then:
   - Click a gap between tiles in a set to insert it
   - Click an empty area on the board to start a new set with it
   - Click another tile to swap selection
3. You can click tiles in your rack to add them to the board:
   - Click a rack tile, then click a board location to place it
4. You can remove tiles you placed this turn from the board back to your rack
5. "Undo" button reverts all changes to the start-of-turn state
6. "End Turn" submits the full board state for validation
7. "Draw Tile" draws and ends turn (only available if no plays made)

**Affected files:**
- `packages/client/src/pages/GameBoard.tsx` — rewrite turn logic to support working copy of board
- `packages/client/src/components/GameBoard.tsx` — add interactive board tile selection/placement, add Undo button
- New: `packages/client/src/hooks/useTurnState.ts` — custom hook managing the working copy of board state during a turn

**Key state:**
- `workingBoard: TileSet[]` — the player's in-progress board (starts as copy of `gameState.board`)
- `workingRack: Tile[]` — the player's in-progress rack (starts as copy of `gameState.yourRack`)
- `selectedTileId: string | null` — currently selected tile (from board or rack)

**Verification:** Manual — can select board tiles, move them, add rack tiles to board, undo

### Step 14: Client — Undo Button

Add undo functionality to revert all changes made this turn.

**Implement:**

- Add "Undo" button to Controls component (visible during player's turn)
- On click: emit `turn:undo`, which reverts the server state; client also resets `workingBoard` and `workingRack` to the last received `gameState`
- Alternatively, since we use the "submit full board" model: undo is purely client-side. The server doesn't need to track intermediate states. The client resets `workingBoard` to `gameState.board` and `workingRack` to `gameState.yourRack`.
- Only available when changes have been made this turn

**Verification:** Manual — make changes, click undo, board reverts

### Step 15: Client — Joker Tile Display

Display joker tiles distinctly on the board and rack.

**Implement:**
- `packages/client/src/components/GameBoard.tsx` — update `TileComponent` to render joker tiles with a special appearance (e.g., star icon, different background)
- Jokers on the board should show their inferred value/color based on the set they're in (resolved by the client for display purposes)

**Verification:** Manual — joker tiles are visually distinct

### Step 16: Client — Game Over with Play Again

Add "Play Again" button to the game over screen.

**Implement:**
- `packages/client/src/pages/GameOver.tsx` — add "Play Again" button
- On click: emit `game:playAgain`, wait for new game state, navigate to game board
- Show cumulative scores across rounds
- Show round number

**Verification:** Manual — game ends, click Play Again, new round starts with scores preserved

### Step 17: Client — Reconnection

Persist player identity and reconnect on page reload.

**Implement:**
- `packages/client/src/App.tsx` — on game page load, check localStorage for `playerId` and `gameCode`
- If found and game is still active, emit `game:reconnect` instead of creating/joining
- Listen for `player:disconnected` and `player:reconnected` events to show notifications
- `packages/client/src/pages/GameBoard.tsx` — show a banner when opponent disconnects/reconnects

**Verification:** Manual — disconnect during game, reload page, reconnect successfully

### Step 18: Client — Disconnect Notification

Show visual feedback when the opponent disconnects.

**Implement:**
- `packages/client/src/components/GameBoard.tsx` — add `OpponentInfo` disconnect indicator
- When `player:disconnected` received, show "Opponent disconnected" banner
- When `player:reconnected` received, show "Opponent reconnected" and clear banner
- Disable "End Turn" / "Draw" while opponent is disconnected (their socket won't receive updates)

**Verification:** Manual — opponent disconnects, banner appears; reconnects, banner clears

### Step 19: Client — Pass Button

Allow passing when pool is empty.

**Implement:**
- `packages/client/src/components/GameBoard.tsx` — add "Pass" button to Controls
- Only enabled when: it's your turn AND pool is empty
- On click: emit `turn:pass`
- Show "Pool empty — you may pass" indicator

**Verification:** Manual — pool empties, pass button appears, both pass → game ends

### Step 20: E2E Tests — Phase 2

Add Playwright tests for all Phase 2 features.

**Test files to create/update:**
- `packages/qa/tests/manipulation.spec.ts`:
  - TC-28: Add a tile to extend an existing run
  - TC-29: Remove a tile from a long run
  - TC-30: Split a run into two runs
  - TC-31: Substitute a tile in a group
  - TC-32: Combined manipulation across multiple sets
  - TC-33: Invalid manipulation (leaves invalid set) is rejected
  - TC-34: Manipulation before initial meld is rejected
  - TC-35: Undo reverts all changes made this turn
- `packages/qa/tests/jokers.spec.ts`:
  - TC-36: Play a joker as part of a run
  - TC-37: Play a joker as part of a group
  - TC-38: Retrieve a joker by replacing with correct tile
  - TC-39: Cannot retrieve joker before initial meld
  - TC-40: Freed joker must be used in same turn
  - TC-41: Joker penalty in scoring (30 points)
- `packages/qa/tests/scoring.spec.ts`:
  - TC-42: Cumulative scoring across two rounds
  - TC-43: Play Again starts new round with preserved scores
- `packages/qa/tests/reconnection.spec.ts`:
  - TC-44: Player disconnects, opponent sees notification
  - TC-45: Player reconnects, game state is restored
- `packages/qa/tests/stalemate.spec.ts`:
  - TC-46: Pool empty, both players pass, game ends
  - TC-47: Pool empty, one player plays, pass counter resets
  - TC-48: Stalemate winner is player with lowest total rack value (not fewest tiles)
  - TC-49: Stalemate scoring uses official formula (loser score = winner rack − loser rack)
- `packages/qa/tests/scoring.spec.ts`:
  - TC-50: Games-won count tracked across rounds
  - TC-51: Overall winner determined by most games won, then highest score

**Verification:** All Playwright tests pass

## Edge Cases

1. **Joker ambiguity in groups**: A joker in a group of 2 real tiles could represent 2 different colors. Client must display which color it represents (inferred from context or stored).
2. **Joker at run boundaries**: `[joker, red-2, red-3]` — joker could be red-1. `[red-12, red-13, joker]` — joker could not be red-14 (max is 13). `[joker, red-1, red-2]` — invalid if joker would need to be red-0.
3. **Two jokers in one run**: `[red-3, joker, joker, red-6]` — valid. `[joker, joker, red-3]` — valid (joker-1 = red-1, joker-2 = red-2).
4. **Joker retrieval and re-use**: Player replaces joker in group with the correct tile, then uses the freed joker in a new set on the same turn. Both the replacement and the new set must be valid.
5. **Joker retrieval without rack tile**: Player manipulates board tiles to free a joker without playing any rack tiles → must be rejected per official rules.
6. **Undo after manipulation**: All board changes and rack changes revert to start-of-turn snapshot.
7. **Undo after play + manipulation**: Same — full revert to snapshot.
8. **Initial meld + manipulation same turn**: Not allowed — manipulation requires having made initial meld first.
9. **Consecutive passes**: If player A passes, player B plays (not a pass), then player A passes again — not consecutive. Counter resets when a play is made.
10. **Stalemate scoring vs normal scoring**: Normal win = winner gets sum of losers' rack values. Stalemate = each loser gets (winner's rack total − their rack total), winner gets positive sum. These produce different results — must use the correct formula.
11. **Stalemate with tied rack values**: If both players have equal rack value, it's a draw (both get 0 for that round).
12. **Play Again when opponent disconnected**: Only allow if both players are connected. If opponent is disconnected, show message to wait.
13. **Reconnection after server restart**: Not supported in MVP (state is in-memory). Player gets "Game not found" error.
14. **Games-won tiebreaker**: If players have equal games won, cumulative score breaks the tie.

## Acceptance Criteria

- [ ] Players can manipulate existing sets on the board (extend, split, shift, substitute)
- [ ] Undo button reverts all changes made during the current turn
- [ ] Joker tiles are generated (2 jokers, 106 total tiles)
- [ ] Jokers can be played in runs and groups
- [ ] Jokers can be retrieved by replacing with the correct tile
- [ ] Freed jokers must be used in the same turn
- [ ] Joker retrieval requires at least one rack tile played this turn
- [ ] Joker retrieval is blocked before initial meld
- [ ] Joker penalty (30 points) applied in scoring
- [ ] Cumulative scoring works across multiple rounds
- [ ] Games-won count is tracked per player across rounds
- [ ] Overall winner determined by most games won (score as tiebreaker)
- [ ] Stalemate uses lowest total rack value (not fewest tiles) to determine winner
- [ ] Stalemate scoring uses official formula (distinct from normal win scoring)
- [ ] "Play Again" starts a new round with preserved scores and games-won counts
- [ ] Disconnected players can reconnect and resume
- [ ] Opponent disconnect/reconnect is visually indicated
- [ ] Pass mechanic works when pool is empty
- [ ] Stalemate detection ends game when both players pass consecutively
- [ ] Inactive games expire after 24 hours
- [ ] All existing Phase 1 functionality still works
- [ ] All tests pass across all packages

## Validation Steps

1. `npm test` — all unit tests pass
2. `npm run typecheck` — no type errors
3. `npm run lint` — no lint errors
4. `npm run build` — all packages build
5. E2E tests pass: `docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e`
6. Manual smoke test:
   - Create game, join, start
   - Make initial meld (30+ points)
   - On next turn, manipulate existing sets
   - Use undo to revert changes
   - Play a joker in a set
   - Retrieve a joker from a set
   - Play to game end, click "Play Again"
   - Verify cumulative scores and games-won counts
   - Disconnect one player, verify notification
   - Reconnect, verify game resumes

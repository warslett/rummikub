# Phase 3.2: 3-4 Player Support

## Goal

Extend Rummikub from 2-player to 2-4 player games. Players join freely via the game URL (up to 4). Any player can start the game once at least 2 have joined. A 5th visitor is offered spectator mode. All game logic (scoring, stalemate, turn rotation, state emission) must work correctly with 2-4 players.

## PRD References

- F-07: If a player visits a game URL that is already full (now 4 players, not 2), they are offered spectator mode instead
- R-01: Players 2-4 (standard); standard contents include 4 racks
- R-09: Number of games per round = number of players (4 players → 4 games, 3 → 3, 2 → 2)
- R-42: Losing players' score — plural "players" (all non-winners)
- R-43: Winner's score = positive total of all other players' rack values
- R-46: Pool-exhausted — player with lowest rack value wins; each loser's score = winner's rack total − their rack total

## Scope Decisions

- **No pre-selection of player count**: The game creator does not choose how many players. Up to 4 players can join. Any player can click "Start Game" once 2+ are in the lobby.
- **5th person = spectator only**: If a 5th user visits the game URL and there are already 4 players, they get the spectator flow.
- **Spectator threshold**: Spectating is available when the game has 4 players OR is already in progress (playing/ended). For games in lobby with <4 players, joining is offered instead.
- **Turn order**: Simple rotation by `currentTurnIndex` (already supported by `advanceTurn`).
- **Pool size**: 106 total − (14 × N players) = pool. With 4 players: 106 − 56 = 50 tiles in pool. With 3: 106 − 42 = 64.
- **Scoring**: Full official multi-loser scoring. Winner gets sum of all losers' rack values. Each loser subtracts their own rack value. Joker penalty = 30 points per joker on rack.
- **Stalemate**: ALL players must pass consecutively (consecutivePasses >= playerCount) for stalemate. Per-official-rules scoring applies.
- **Games per round**: Not enforced in this milestone (that's a house-rule / manual decision). The "Play Again" button remains available. The `roundNumber` concept already exists.
- **Lobby notifications**: When a new player joins, ALL existing players in the lobby are notified (not just the creator).

## Acceptance Criteria

1. A game can have 2, 3, or 4 players
2. Players join via the game URL; the lobby shows all joined players
3. The "Start Game" button is enabled when 2+ players have joined; any player can click it
4. A 5th visitor is offered spectator mode
5. Turn rotation works correctly for 2-4 players (circular: 0 → 1 → 2 → 3 → 0)
6. Scoring: winner gets sum of all losers' rack values; each loser gets negative of their own rack value
7. Stalemate: all N players must pass consecutively; scoring uses the official multi-loser formula
8. Each player sees all opponents' names, rack sizes, scores, and connected status
9. Spectator view shows all players (not just 2)
10. Disconnect/reconnect notifications work for all opponents
11. "Play Again" resets for all players; cumulative scores and games-won persist
12. All existing 2-player functionality continues to work

## Edge Cases

- Game with exactly 2 players — all existing behavior preserved (backward compatibility)
- Game with 4 players and pool of 50 tiles — still enough for normal gameplay
- Stalemate with 3-4 players — all must pass, not just 2
- Stalemate scoring with tied lowest rack values among multiple players — null result (no winner), game is a draw
- A player disconnects during a 3-4 player game — only that player is marked disconnected; game continues
- Lobby with 3 players — a 4th can still join; Start Game is already enabled
- Player joins lobby then leaves (disconnects) — their slot should be freed so another player can join (or: the game shows them as disconnected; this is a design choice — **for MVP, disconnected lobby players remain in the game**)
- `calculateStalemateScores` with 3+ players where two or more tie for lowest rack value → null (no winner, draw)

## E2E Tests

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-MP-01 | 3-player game creation and start | P1 creates game, P2 joins, P3 joins, P2 clicks Start | All 3 players see game board; turn indicator shows P1's turn |
| TC-MP-02 | 4-player game creation and start | P1 creates, P2-P4 join, Start | All 4 see game board; correct pool count (106 − 56 = 50) |
| TC-MP-03 | Start button disabled with 1 player | P1 creates game | Start button not visible or disabled |
| TC-MP-04 | 5th visitor offered spectator mode | 4 players join, P5 visits URL | P5 sees "Watch as Spectator" option |
| TC-MP-05 | 3-player turn rotation | 3-player game, P1 ends turn | P2's turn; P2 ends → P3's turn; P3 ends → P1's turn |
| TC-MP-06 | 3-player scoring — winner gets sum of losers | 3-player game ends (P1 wins, P2 has 20 rack, P3 has 15 rack) | P1 score = +35; P2 score = −20; P3 score = −15 |
| TC-MP-07 | 4-player scoring — winner gets sum of losers | 4-player game ends (P1 wins, P2=10, P3=20, P4=30) | P1 = +60; P2 = −10; P3 = −20; P4 = −30 |
| TC-MP-08 | 3-player stalemate — all 3 pass | Pool empty, P1 passes, P2 passes, P3 passes | Game ends; lowest rack value wins |
| TC-MP-09 | 3-player stalemate scoring | P1 rack=5, P2 rack=20, P3 rack=15, stalemate | P1 wins; P2 = 5−20 = −15; P3 = 5−15 = −10; P1 = +25 |
| TC-MP-10 | 3-player game sees all opponents | 3-player game in progress | Each player sees 2 opponents with names, rack sizes |
| TC-MP-11 | Lobby shows all joined players | P1 creates, P2 joins, P3 joins | All 3 names visible in lobby |
| TC-MP-12 | Player disconnect in 3-player game | 3-player game, P2 disconnects | P1 and P3 see P2 disconnected; game continues |
| TC-MP-13 | 3-player Play Again | 3-player game ends, Play Again clicked | New round starts for all 3; scores persist |
| TC-MP-14 | 2-player game unchanged | Standard 2-player game | All existing behavior works identically |

## Implementation Steps

### Step 1: Shared — Add Player Count Constants and Update Types

Add `MIN_PLAYERS` and `MAX_PLAYERS` constants. Refactor `PlayerGameState` to replace singular opponent fields with an `opponents` array. Update `GameJoinedPayload` to support multiple existing players.

**Test first, then implement:**

- `packages/shared/src/constants.ts` — add:
  ```typescript
  export const MIN_PLAYERS = 2;
  export const MAX_PLAYERS = 4;
  ```

- `packages/shared/src/types.ts` — add `OpponentInfo` interface and update `PlayerGameState`:
  ```typescript
  export interface OpponentInfo {
    id: string;
    name: string;
    rackSize: number;
    score: number;
    gamesWon: number;
    connected: boolean;
  }
  ```
  Remove from `PlayerGameState`: `opponentRackSize`, `opponentName`, `opponentScore`, `opponentGamesWon`, `opponentConnected`. Add: `opponents: OpponentInfo[]`.

- Update `GameJoinedPayload`:
  ```typescript
  export interface GameJoinedPayload {
    playerId: string;
    playerNames: string[];
  }
  ```
  Replace `opponentName: string` with `playerNames: string[]` (names of all other players already in the game).

**Tests:**
- Type-level: `PlayerGameState` compiles with `opponents` field
- Type-level: `GameJoinedPayload` compiles with `playerNames` field

**Verification:** `npm run typecheck` passes

---

### Step 2: Server — Update GameEndResult for Multiple Losers

Refactor `GameEndResult` to support N losers instead of a single loser.

**Test first, then implement:**

- `packages/server/src/game.ts` — replace `GameEndResult` with:
  ```typescript
  export interface GameEndResult {
    winnerId: string;
    winnerName: string;
    winnerScore: number;
    losers: { id: string; name: string; penalty: number; rackValue: number }[];
  }
  ```

- Update `calculateScores()`:
  - Find ALL losers (players where `id !== winnerId`)
  - `winnerScore` = sum of all losers' rack values
  - Each loser's `penalty` = negative of their own rack value (including joker penalty at 30 pts each)

- Update `calculateStalemateScores()`:
  - Find the player with the minimum rack value (winner)
  - ALL other players are losers
  - Each loser's `penalty` = winner's rack value − loser's rack value (negative number)
  - `winnerScore` = positive sum of all losers' penalty magnitudes (i.e., `sum(loser.rackValue - winner.rackValue)`)
  - If multiple players tie for lowest rack value → return null (draw)

- Update `applyScores()`:
  - Iterate all losers from `result.losers` and apply each penalty
  - Apply `result.winnerScore` to the winner

- Remove `applyStalemateScores()` — `applyScores()` now handles both paths

**Tests (`packages/server/src/game.test.ts`):**
- `calculateScores` with 2 players: winner gets loser's rack value, loser gets negative
- `calculateScores` with 3 players: winner gets sum of 2 losers' values
- `calculateScores` with 4 players: winner gets sum of 3 losers' values
- `calculateStalemateScores` with 3 players: each loser gets (winner_rack − own_rack)
- `calculateStalemateScores` with 4 players: same formula, 3 losers
- `calculateStalemateScores` with tied lowest rack values → null
- `applyScores` applies correctly to multiple losers

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 3: Server — Update Game Class for 2-4 Players

Remove hardcoded 2-player limits from the Game class.

**Test first, then implement:**

- `packages/server/src/game.ts`:
  - `addPlayer()`: change `>= 2` to `>= MAX_PLAYERS` (import from shared). Update error message.
  - `start()`: change `< 2` to `< MIN_PLAYERS`. Update error message.
  - `passTurn()`: change `consecutivePasses >= 2` to `consecutivePasses >= this.state.players.length`
  - `getPlayerState()`: replace single-opponent logic with multi-opponent:
    ```typescript
    const opponents = this.state.players
      .filter((p) => p.id !== playerId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        rackSize: p.rack.length,
        score: p.score,
        gamesWon: p.gamesWon,
        connected: p.connected,
      }));
    ```
    Return `opponents` instead of individual opponent fields.

**Tests (`packages/server/src/game.test.ts`):**
- `addPlayer` accepts up to 4 players
- `addPlayer` rejects 5th player
- `start` requires minimum 2 players
- `start` works with 3 players
- `start` works with 4 players
- `getPlayerState` returns multiple opponents for 3-player game
- `passTurn` stalemate requires all N players to pass (not just 2)
- Pool size correct for 3 players (106 − 42 = 64) and 4 players (106 − 56 = 50)

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 4: Server — Update Socket.IO Handlers for Multi-Player

Update all handlers that assume 2 players.

**Test first, then implement:**

- `packages/server/src/handlers.ts`:
  - `game:join`: change `state.players.length >= 2` to `>= MAX_PLAYERS` (import from shared)
  - `game:join`: emit `playerNames: string[]` (all existing player names) instead of `opponentName`
  - `game:join`: notify ALL existing players in the room about the new join (not just one)
  - `game:spectate`: change `state.players.length < 2` to `state.players.length >= MAX_PLAYERS || state.phase !== "lobby"` — spectate when game is full OR already in progress
  - `turn:pass`: update stalemate score emission to use new `GameEndResult` with `losers` array
  - `emitGameEnded()`: update score emission to use `losers` array — each player gets their own score:
    ```typescript
    const loserMap = new Map(scores.losers.map(l => [l.id, l]));
    scores: state.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.id === scores.winnerId ? scores.winnerScore : loserMap.get(p.id)!.penalty,
      rackValue: p.id === scores.winnerId ? 0 : game.getRackValue(p.id),
    })),
    ```

**Tests:**
- Join handler accepts players up to MAX_PLAYERS
- Join handler rejects players beyond MAX_PLAYERS with `game:full`
- Join handler sends all existing player names to new joiner
- Join handler notifies all existing players about new joiner
- Stalemate emission with 3 players has correct per-player scores
- `emitGameEnded` with 3+ players has correct per-player scores

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 5: Client — Update GameContext and App for Multi-Opponent Types

Update the client to use the new `OpponentInfo[]` type instead of singular opponent fields.

**Test first, then implement:**

- `packages/client/src/contexts/GameContext.tsx` — no changes needed (uses `PlayerGameState` from shared which is already updated)

- `packages/client/src/App.tsx`:
  - Update `game:joined` listener to handle `playerNames: string[]` instead of `opponentName: string`
  - The rest of App.tsx doesn't directly reference opponent fields (it passes `gameState` through context)

**Verification:** `npm run typecheck` passes

---

### Step 6: Client — Update Lobby for Multi-Player

Update the lobby to show all joined players and allow starting with 2-4 players.

**Test first, then implement:**

- `packages/client/src/pages/Lobby.tsx`:
  - Replace `opponentJoined: boolean` with `joinedPlayerNames: string[]` (names of other players who have joined)
  - Replace `opponentName: string | null` — no longer needed (names are in the array)
  - Update `game:joined` listener:
    - `onJoined` receives `{ playerId, playerNames }` → set `joinedPlayerNames = playerNames`
  - Show all joined player names in the lobby (not just one opponent)
  - "Share this code with other players" (plural, not "opponent")
  - "Start Game" button visible when `joinedPlayerNames.length >= 1` (i.e., at least 2 total players including self)
  - Show player count: "2/4 players" etc.
  - When a new player joins, existing players also need to be notified — listen for `game:joined` events from other players joining and update the list

**Key design**: The lobby needs to track ALL player names, not just one opponent. When `game:joined` is received:
- For the joining player: `playerNames` gives them the list of existing players
- For existing players: the `game:joined` broadcast to the room needs to include the new player's name

Update the server `game:join` handler to broadcast `{ playerName: string }` to existing players (in addition to the existing player names sent to the joining player). The client lobby listens for this broadcast and appends the name.

**Tests:**
- Lobby shows "1/4 players" when only creator is present
- Lobby shows "3/4 players" when 2 others have joined
- Start Game button appears when 2+ players are present
- All player names are listed in the lobby

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 7: Client — Update GameBoard for Multi-Opponent Display

Update the game board page to show all opponents instead of just one.

**Test first, then implement:**

- `packages/client/src/pages/GameBoard.tsx`:
  - Replace `opponentDisconnected: boolean` with `disconnectedOpponents: Set<string>` (tracking by player ID)
  - Update `player:disconnected` / `player:reconnected` listeners to add/remove from the set
  - Render `OpponentInfo` for each opponent in `gameState.opponents`
  - Update score display: show each opponent's score individually (e.g., "You: 10 pts · Alice: 5 pts · Bob: −3 pts")
  - Update games-won display: show each player's wins
  - Update turn indicator: use `currentTurnPlayerId` to find the player name (already available from opponents)
  - Pass `anyOpponentDisconnected` to Controls (true if any opponent is disconnected — disables actions)
  - Update "Waiting for opponent..." text in Controls to "Waiting for other players..."

- `packages/client/src/components/GameBoard.tsx`:
  - `OpponentInfo`: no changes needed (it's already per-opponent; it will be rendered in a loop)
  - `Controls`: rename `opponentDisconnected` to `anyPlayerDisconnected` for clarity. Update "Waiting for opponent..." text.

**Tests:**
- GameBoard renders multiple `OpponentInfo` components
- GameBoard shows all opponents' scores
- Disconnected set tracks multiple opponents correctly

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 8: Client — Update SpectateBoard for Multi-Player

Update the spectator view to handle 2-4 players dynamically.

**Test first, then implement:**

- `packages/client/src/pages/SpectateBoard.tsx`:
  - Replace `opponentDisconnected: string | null` with `disconnectedPlayers: Set<string>`
  - Update disconnect/reconnect listeners to track multiple players
  - Update score display to iterate over all players instead of `players[0]`/`players[1]`
  - Update games-won display to show all players

**Tests:**
- SpectateBoard renders all players' scores
- SpectateBoard tracks multiple disconnected players

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 9: Client — Update GameOver for Multi-Player

The GameOver component already iterates over `result.scores` and `result.gamesWon` arrays, so it should work with 3-4 players with minimal changes.

**Test first, then implement:**

- `packages/client/src/pages/GameOver.tsx`:
  - Update stalemate text: "both players passed" → "all players passed"

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 10: Update Server Test Suite

Fix all existing tests that hardcode 2-player assumptions.

**Implement:**

- `packages/server/src/game.test.ts`:
  - Update "should reject adding more than 2 players" → "should reject adding more than MAX_PLAYERS players" (test with 5th player)
  - Update "should require 2 players to start" → "should require MIN_PLAYERS to start"
  - Update pool size assertions that use `INITIAL_HAND_SIZE * 2`
  - Update stalemate tests: `consecutivePasses >= 2` → needs all N players to pass
  - Update scoring tests for multi-loser `GameEndResult`
  - Add new tests for 3-player and 4-player scenarios

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 11: E2E Tests

Write Playwright E2E tests for all multi-player scenarios.

**Tests to add in `packages/qa/tests/multiplayer.spec.ts`:**

- TC-MP-01: 3-player game creation and start
- TC-MP-02: 4-player game creation and start
- TC-MP-03: Start button disabled with 1 player
- TC-MP-04: 5th visitor offered spectator mode
- TC-MP-05: 3-player turn rotation
- TC-MP-06: 3-player scoring — winner gets sum of losers
- TC-MP-07: 4-player scoring — winner gets sum of losers
- TC-MP-08: 3-player stalemate — all 3 pass
- TC-MP-09: 3-player stalemate scoring
- TC-MP-10: 3-player game sees all opponents
- TC-MP-11: Lobby shows all joined players
- TC-MP-12: Player disconnect in 3-player game
- TC-MP-13: 3-player Play Again
- TC-MP-14: 2-player game unchanged

**Verification:** `docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e` passes

---

### Step 12: Lint, Typecheck, Final Verification

Run full project checks.

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Verification:** All pass.

---

### Step 13: Update Documentation

Update entities.md to reflect 2-4 player support.

- `docs/entities.md`:
  - Change `Game → Player | 1:N (exactly 2)` to `Game → Player | 1:N (2-4)`
  - Update Mermaid diagram: `Game ||--|{ Player : "has exactly 2"` → `Game ||--|{ Player : "has 2-4"`

**Verification:** Documentation is consistent with implementation.

## Affected Files

| File | Change |
|------|--------|
| `packages/shared/src/constants.ts` | Add `MIN_PLAYERS = 2`, `MAX_PLAYERS = 4` |
| `packages/shared/src/types.ts` | Add `OpponentInfo`; update `PlayerGameState` (replace singular opponent fields with `opponents` array); update `GameJoinedPayload` (replace `opponentName` with `playerNames`) |
| `packages/shared/src/index.ts` | Export new types/constants |
| `packages/server/src/game.ts` | Update `GameEndResult` for multiple losers; update `addPlayer`, `start`, `passTurn`, `calculateScores`, `calculateStalemateScores`, `applyScores`, `getPlayerState` for 2-4 players |
| `packages/server/src/game.test.ts` | Fix all 2-player hardcoded tests; add 3-4 player test scenarios |
| `packages/server/src/handlers.ts` | Update `game:join` (multi-player join, broadcast), `game:spectate` (threshold), `turn:pass` (multi-loser scores), `emitGameEnded` (multi-loser scores) |
| `packages/client/src/App.tsx` | Update `game:joined` listener for `playerNames` |
| `packages/client/src/pages/Lobby.tsx` | Show all joined players; Start Game at 2+; player count display |
| `packages/client/src/pages/GameBoard.tsx` | Render multiple `OpponentInfo`; track disconnected opponents by ID; update scores/wins display |
| `packages/client/src/components/GameBoard.tsx` | Update `Controls` text and `opponentDisconnected` prop |
| `packages/client/src/pages/SpectateBoard.tsx` | Dynamic player display (iterate, not index) |
| `packages/client/src/pages/GameOver.tsx` | Update stalemate text |
| `packages/qa/tests/multiplayer.spec.ts` | New file: E2E tests for 3-4 player scenarios |
| `packages/qa/tests/helpers.ts` | Possibly add multi-player helper functions |
| `docs/entities.md` | Update cardinality from "exactly 2" to "2-4" |

## Validation Steps

1. **Automated**: All unit tests pass (`npm test`)
2. **Automated**: Type checking passes (`npm run typecheck`)
3. **Automated**: Linting passes (`npm run lint`)
4. **Automated**: Build succeeds (`npm run build`)
5. **Automated**: E2E tests pass (including new multi-player tests)
6. **Manual**: Start dev server, create a game, have 3 players join via different browser tabs, verify lobby shows all 3, click Start, verify turn rotation works, verify all opponents are visible
7. **Manual**: 4-player game — verify pool shows 50 tiles, turns rotate through 4 players
8. **Manual**: 2-player game — verify no regression

# Phase 3.1: Spectator Mode

## Goal

Allow additional users to join a game as read-only spectators when the game already has two players. Spectators can see the board, pool count, turn indicator, and scores — but NOT any player's private rack. Spectators cannot interact with the game in any way.

## PRD References

- F-07: If a player visits a game URL that is already full (2 players), they are offered spectator mode instead
- F-29: Additional users can join as read-only spectators via the game URL when the game is full
- F-30: Spectators can see the board but NOT any player's private rack
- F-31: Spectators cannot interact with the game in any way
- F-32: Spectators can see whose turn it is and the pool count
- Architecture §5.2: Spectator connects via Socket.IO, receives read-only broadcast
- Architecture §5.3: `game:spectate` event — `{ gameCode }`
- Architecture §5.6.6: Spectator via same room — spectators join the Socket.IO room but receive filtered state (no rack data)

## Scope Decisions

- **Spectator identity**: Spectators do not enter a name. They are anonymous observers. No "spectator count" display for players (can be added later).
- **When can you spectate?**: Only when the game already has 2 players (full). If the game is in lobby phase with <2 players, the user is offered the normal join flow instead.
- **Spectator on game end**: Spectators see the game-over screen (same as players) and continue to spectate if players choose "Play Again".
- **No spectator chat**: Out of scope.
- **No reconnection for spectators**: If a spectator disconnects, they just re-spectate. No localStorage persistence of spectator identity.
- **Spectator count limit**: No hard limit for MVP; practical limit is Socket.IO room size (default ~1000).
- **Full-game URL**: Spectators use the same game URL (`/game/{gameCode}`). The client detects whether the user is a player or spectator based on server response.

## Acceptance Criteria

1. When a user visits `/game/{gameCode}` and the game is full, they are offered a "Watch as Spectator" option
2. Clicking "Watch as Spectator" connects them to the game room and they see the board, pool count, turn indicator, and scores
3. Spectators never see any player's rack tiles (neither tile values nor count is shown for individual players)
4. Spectators see both player names and whose turn it is
5. Spectators cannot draw, play, manipulate, undo, end turn, or pass — no action buttons are shown
6. When a player makes a move, spectators see the updated board in real-time
7. Spectators see the game-over screen when the game ends
8. If players click "Play Again", spectators see the new round continue
9. Spectators see disconnect/reconnect notifications
10. If a user visits the game URL and the game is NOT full, they get the normal join flow (no spectator option)

## Edge Cases

- User visits game URL for a game that doesn't exist → show error (same as current behavior)
- User visits game URL for a game in lobby phase with 1 player → offer join, not spectate
- User visits game URL for a game in lobby phase with 2 players (not started yet) → offer spectate
- User visits game URL for a game that has ended → offer spectate (they can see the final state)
- Multiple spectators join simultaneously → all work independently
- Spectator disconnects and revisits URL → re-enters spectator mode
- Spectator is in the room when game ends → sees game-over event
- Spectator is in the room when players play again → sees new round state

## E2E Tests

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-SPEC-01 | Spectator joins a full game | P1 creates game, P2 joins, P3 visits game URL | P3 sees "Watch as Spectator" option; after clicking, sees board and player names |
| TC-SPEC-02 | Spectator sees real-time board updates | P1 creates game, P2 joins, spectate, P1 draws a tile | Spectator's pool count decrements |
| TC-SPEC-03 | Spectator cannot see rack tiles | Spectator is watching a game in progress | No rack tiles or rack tile counts are visible to spectator |
| TC-SPEC-04 | Spectator has no action controls | Spectator is watching a game in progress | No Draw/End Turn/Pass/Play buttons visible |
| TC-SPEC-05 | Spectator sees turn indicator | Spectator is watching, turns alternate | Current turn player name is displayed |
| TC-SPEC-06 | Spectator sees game end and Play Again | Spectator watches until game ends, players click Play Again | Spectator sees game-over results; after Play Again, sees new round |
| TC-SPEC-07 | Spectator sees disconnect notification | Spectator is watching, one player disconnects | Spectator sees disconnect banner |
| TC-SPEC-08 | Non-full game offers join not spectate | P1 creates game, P3 visits URL before P2 joins | P3 sees normal join flow, no spectator option |

## Implementation Steps

### Step 1: Shared — Add Spectator Types

Add a `SpectatorGameState` type to `packages/shared/src/types.ts`. This is the state sent to spectators — same as `PlayerGameState` but without rack data.

**Test first, then implement:**

- Add `SpectatorGameState` interface:
  ```typescript
  export interface SpectatorGameState {
    id: string;
    phase: GamePhase;
    board: TileSet[];
    poolSize: number;
    currentTurnPlayerId: string;
    players: { id: string; name: string; rackSize: number; score: number; gamesWon: number; connected: boolean }[];
    roundNumber: number;
    consecutivePasses: number;
  }
  ```
- Add `SpectatorJoinedPayload` interface:
  ```typescript
  export interface SpectatorJoinedPayload {
    gameState: SpectatorGameState;
  }
  ```
- Export from `packages/shared/src/index.ts`

**Tests:**
- Type-level: ensure `SpectatorGameState` compiles with expected fields
- No runtime tests needed (type-only)

**Verification:** `npm run typecheck` passes

---

### Step 2: Server — Add Spectator State Method to Game Class

Add `getSpectatorState()` method to the `Game` class in `packages/server/src/game.ts`.

**Test first, then implement:**

- `game.getSpectatorState()` returns a `SpectatorGameState` with:
  - Board, poolSize, currentTurnPlayerId, phase, roundNumber, consecutivePasses from game state
  - Player list with `id`, `name`, `rackSize`, `score`, `gamesWon`, `connected` — but NO rack tiles
- Write unit tests in `packages/server/src/game.test.ts`:
  - `getSpectatorState()` returns correct structure
  - `getSpectatorState()` does not include any player's rack tiles
  - `getSpectatorState()` includes both player names and rack sizes

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 3: Server — Add `game:spectate` Socket.IO Handler

Add the `game:spectate` event handler in `packages/server/src/handlers.ts`.

**Test first, then implement:**

- Handler receives `{ gameCode }` from the socket
- Validates the game exists (error if not)
- Sets `socket.data.isSpectator = true` and `socket.data.gameCode = gameCode`
- Joins the socket to the game's Socket.IO room
- Emits `spectator:joined` with `{ gameState: game.getSpectatorState() }` to the connecting socket

**Update `SocketData` interface:**
```typescript
interface SocketData {
  playerId: string;
  gameCode: string;
  isSpectator: boolean;
}
```

**Update `emitPlayerStates`:** After emitting to players, also emit spectator state to all spectators in the room. Iterate sockets in the room; for those with `isSpectator === true`, emit `game:state` with `{ gameState: game.getSpectatorState() }`.

**Update `emitGameEnded`:** Also emit to spectators (they see the same `game:ended` payload since it contains no rack data).

**Update `game:join` handler:** When the game is full (`state.players.length >= 2`), instead of emitting `game:error`, emit a specific event `game:full` so the client can offer spectator mode. This replaces the current `"Game is full"` error.

**Update disconnect handler:** If the disconnecting socket is a spectator, just leave the room silently (no `player:disconnected` broadcast).

**Tests (unit in handlers or integration):**
- Spectating a valid game returns spectator state
- Spectating a non-existent game returns error
- Spectator receives state updates when a player acts
- Spectator does not trigger `player:disconnected`
- Joining a full game returns `game:full` event (not `game:error`)

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 4: Server — Emit Spectator State on All Game Events

Ensure every code path that calls `emitPlayerStates` or `emitGameEnded` also sends updated state to spectators.

**Implementation:**

- In `emitPlayerStates()`: after the player loop, add a spectator loop that sends `game:state` with `getSpectatorState()` to sockets where `isSpectator === true`
- In `emitGameEnded()`: the `game:ended` event is already broadcast to the room via `io.to(gameCode)`, so spectators receive it automatically
- For `game:started`: add spectator emission alongside player emission
- For disconnect/reconnect notifications: already broadcast to room, spectators receive them

**Tests:**
- After a draw, spectator receives updated state
- After turn:end, spectator receives updated state
- After game:started, spectator receives initial state
- After game:playAgain, spectator receives new round state

**Verification:** `npm test --workspace=packages/server` passes

---

### Step 5: Client — Add Spectator Game Board Page

Create a spectator-specific game board view in the client.

**Test first, then implement:**

- New page component: `packages/client/src/pages/SpectateBoard.tsx`
  - Shows: board, player names, turn indicator ("X's turn"), pool count, scores, round info, games-won
  - Does NOT show: rack, draw/play/undo/end turn/pass buttons, initial meld reminder
  - Shows disconnect/reconnect notifications
  - Shows game-over results when received
  - Shows a "Spectating" badge at the top
- Uses `SpectatorGameState` type for its state (not `PlayerGameState`)

**Update `packages/client/src/contexts/GameContext.tsx`:**
- Add `spectatorState: SpectatorGameState | null` and `isSpectator: boolean` to context
- Add `setSpectatorState` and `setIsSpectator` setters

**Update `packages/client/src/App.tsx`:**
- Listen for `spectator:joined` event → set `spectatorState` and `isSpectator = true`
- Listen for `game:state` → if `isSpectator`, update `spectatorState` instead of `gameState`
- Listen for `game:ended` → set game ended data for spectator too
- In `GameBoardWrapper`: if `isSpectator`, render `<SpectateBoard />` instead of `<GameBoard />`

**Tests:**
- SpectateBoard renders player names and turn indicator
- SpectateBoard does not render rack or action buttons
- SpectateBoard renders game-over when game:ended received

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 6: Client — Update Home/Join Flow to Offer Spectator Mode

Update the game join flow so that when a game is full, the user is offered the option to spectate.

**Test first, then implement:**

- Update `packages/client/src/pages/Home.tsx` (or the `GameBoardWrapper` in `App.tsx`):
  - When visiting `/game/{gameCode}` and the game is full, show "This game is full. Watch as Spectator?" with a button
  - Clicking the button emits `game:spectate` and navigates to the game view
- Listen for `game:full` event in `App.tsx`:
  - Set a state flag `gameFull: true`
  - Show spectator option in the UI

**Alternative approach**: Since the game URL is `/game/{gameCode}`, the `GameBoardWrapper` component is the entry point. When it detects the game is full (via `game:full` event), it shows a spectator offer. This avoids changing the URL structure.

**Flow:**
1. User visits `/game/{gameCode}`
2. Client connects socket and emits `game:join`
3. If server responds with `game:full` → show "Watch as Spectator?" button
4. If server responds with `game:joined` → normal player flow
5. If server responds with `game:error` (game not found) → show error

**Tests:**
- Visiting a full game's URL shows spectator option
- Clicking "Watch as Spectator" enters spectator mode
- Visiting a non-full game URL shows normal join flow

**Verification:** `npm test --workspace=packages/client` passes

---

### Step 7: E2E Tests

Write Playwright E2E tests for all spectator scenarios.

**Tests to add in `packages/qa/tests/spectator.spec.ts`:**

- TC-SPEC-01: Spectator joins a full game
- TC-SPEC-02: Spectator sees real-time board updates
- TC-SPEC-03: Spectator cannot see rack tiles
- TC-SPEC-04: Spectator has no action controls
- TC-SPEC-05: Spectator sees turn indicator
- TC-SPEC-06: Spectator sees game end and Play Again
- TC-SPEC-07: Spectator sees disconnect notification
- TC-SPEC-08: Non-full game offers join not spectate

**Verification:** `docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e` passes

---

### Step 8: Lint, Typecheck, Final Verification

Run full project checks.

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Verification:** All pass.

## Affected Files

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `SpectatorGameState`, `SpectatorJoinedPayload` |
| `packages/shared/src/index.ts` | Export new types |
| `packages/server/src/game.ts` | Add `getSpectatorState()` method |
| `packages/server/src/game.test.ts` | Add tests for `getSpectatorState()` |
| `packages/server/src/handlers.ts` | Add `game:spectate` handler; update `emitPlayerStates`, `emitGameEnded`, `game:join` (full game), disconnect handler |
| `packages/client/src/contexts/GameContext.tsx` | Add spectator state to context |
| `packages/client/src/App.tsx` | Add spectator event listeners, routing for spectator mode |
| `packages/client/src/pages/SpectateBoard.tsx` | New file: spectator game board view |
| `packages/client/src/pages/Home.tsx` | Possibly update join flow for spectator offer |
| `packages/client/src/components/GameBoard.tsx` | Possibly extract shared board display for reuse by SpectateBoard |
| `packages/qa/tests/spectator.spec.ts` | New file: E2E tests for spectator mode |

## Validation Steps

1. **Automated**: All unit tests pass (`npm test`)
2. **Automated**: Type checking passes (`npm run typecheck`)
3. **Automated**: Linting passes (`npm run lint`)
4. **Automated**: Build succeeds (`npm run build`)
5. **Automated**: E2E tests pass
6. **Manual**: Start dev server, create a game with 2 players, open a third browser tab with the game URL → verify spectator option appears, clicking it shows the board without racks, moves appear in real-time

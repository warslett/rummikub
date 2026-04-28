# Phase 1: Foundation (MVP)

## Goal

Build a playable 2-player Rummikub game with: game creation/joining, turn-based play (draw or play new sets), initial meld enforcement, game over detection, and scoring. No jokers, no tile manipulation, no cumulative rounds.

## Scope Decisions

- **Styling**: Tailwind CSS
- **Tile placement**: Click/tap to select + click to place (no drag-and-drop)
- **Jokers**: Excluded (deferred to Phase 2)
- **Rounds**: Single round only (no "Play Again" or cumulative scoring)
- **Tile manipulation**: Excluded (deferred to Phase 2)
- **Undo**: Excluded (deferred to Phase 2)
- **Reconnection**: Excluded (deferred to Phase 2)

## Affected Packages

- `packages/shared` — types, constants, validation
- `packages/server` — Express + Socket.IO backend, game logic
- `packages/client` — React + Vite + Tailwind frontend

## Implementation Steps

### Step 1: Project Scaffolding

Set up the monorepo with all tooling configured and building successfully.

**Files to create:**

- Root `package.json` with npm workspaces
- Root `tsconfig.json` with base config
- Root `vitest.workspace.ts`
- `packages/shared/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/server/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/client/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `tailwind.config.js`, `postcss.config.js`, `src/index.css`
- `.gitignore`

**Verification:**
- `npm install` succeeds
- `npm run build` succeeds for all packages
- `npm test` runs (no tests yet, exits 0)
- `npm run typecheck` passes
- `npm run lint` passes

### Step 2: Shared — Types and Constants

Define all shared types and constants. No jokers.

**Test first, then implement:**

- `packages/shared/src/constants.ts` — colors, values, tile counts, initial meld minimum
- `packages/shared/src/types.ts` — Tile, TileSet, Player, GameState, GamePhase, Action, TurnAction, Socket event payloads
- `packages/shared/src/index.ts` — barrel export

**Tests (`packages/shared/src/constants.test.ts`, `packages/shared/src/types.test.ts`):**
- Constants have correct values (4 colors, values 1-13, 2 copies each = 104 tiles, initial hand size 14, initial meld minimum 30)

**Verification:** `npm test --workspace=packages/shared` passes

### Step 3: Shared — Validation Functions

Pure functions that validate tile sets. Used by both server and tests.

**Test first, then implement:**

- `packages/shared/src/validation.ts` — `isValidRun(tiles)`, `isValidGroup(tiles)`, `isValidSet(tiles)`, `calculateSetValue(tiles)`, `isInitialMeldMet(actions, playerRack)`

**Tests (`packages/shared/src/validation.test.ts`):**
- `isValidRun`: consecutive same-color, min 3 tiles, rejects non-consecutive, rejects mixed colors, rejects < 3
- `isValidGroup`: same value, distinct colors, min 3 max 4, rejects duplicate colors, rejects different values
- `isValidSet`: delegates to run or group check
- `calculateSetValue`: sums tile values correctly
- `isInitialMeldMet`: returns true when sum >= 30 from player's own rack, false when < 30, false when using board tiles

**Verification:** `npm test --workspace=packages/shared` passes

### Step 4: Shared — Tile Generation

Generate the full tile set (104 tiles, no jokers).

**Test first, then implement:**

- `packages/shared/src/tiles.ts` — `generateAllTiles()`, `shuffleTiles(tiles)`

**Tests (`packages/shared/src/tiles.test.ts`):**
- `generateAllTiles` returns 104 tiles
- Each color has 2 copies of values 1-13
- Tile IDs are unique
- `shuffleTiles` returns same tiles in different order (probabilistic — check length and membership)

**Verification:** `npm test --workspace=packages/shared` passes

### Step 5: Server — Game State Machine

Core game logic. The state machine manages transitions and enforces rules.

**Test first, then implement:**

- `packages/server/src/game.ts` — `Game` class with methods:
  - `constructor(gameCode)` — creates game in lobby phase
  - `addPlayer(playerId, name)` — adds a player (max 2)
  - `start()` — transitions lobby → playing, deals tiles, determines first player
  - `drawTile(playerId)` — draws from pool, ends turn
  - `playSets(playerId, newSets)` — player places new sets from rack onto board
  - `endTurn(playerId)` — validates board state, advances turn
  - `getState()` — returns full game state
  - `getPlayerState(playerId)` — returns state filtered for a specific player (own rack, opponent rack size)

**Tests (`packages/server/src/game.test.ts`):**
- Game starts in lobby phase
- Adding players works, max 2 enforced
- `start()` deals 14 tiles each, transitions to playing phase
- `drawTile()` removes tile from pool, adds to rack, advances turn
- `playSets()` removes tiles from rack, adds sets to board
- `playSets()` rejects if not player's turn
- `playSets()` rejects if player hasn't made initial meld and sets < 30 points
- `playSets()` rejects if tiles not from player's rack
- `playSets()` rejects if any set is invalid
- `endTurn()` validates all board sets are valid
- Game ends when a player empties their rack
- Game ends when pool empty and current player cannot play (simplified: draw fails with empty pool)
- Scoring calculated correctly on game end
- Cannot draw from empty pool

**Verification:** `npm test --workspace=packages/server` passes

### Step 6: Server — Game Manager

Manages all active games. Code generation, lookup, cleanup.

**Test first, then implement:**

- `packages/server/src/gameManager.ts` — `GameManager` class:
  - `createGame()` — creates game, returns game code
  - `getGame(gameCode)` — retrieves game
  - `gameCodeExists(gameCode)` — checks existence
  - `generateGameCode()` — 6-char alphanumeric, no ambiguous chars

**Tests (`packages/server/src/gameManager.test.ts`):**
- `createGame()` returns a valid game code
- `getGame()` returns the game
- `getGame()` returns undefined for invalid code
- Generated codes are 6 chars, alphanumeric, no 0/O/1/I/l
- Multiple games can coexist

**Verification:** `npm test --workspace=packages/server` passes

### Step 7: Server — Socket.IO Handlers

Wire up Socket.IO events to the game manager.

**Test first, then implement:**

- `packages/server/src/index.ts` — Express + Socket.IO setup
- `packages/server/src/handlers/gameHandlers.ts` — handles `game:create`, `game:join`, `game:start`
- `packages/server/src/handlers/turnHandlers.ts` — handles `turn:draw`, `turn:play`, `turn:end`
- `packages/server/src/handlers/connectionHandler.ts` — maps socket to player/game

**Tests (`packages/server/src/handlers/*.test.ts`):**
- Use `socket.io-client` with an in-memory server
- `game:create` → `game:created` with code and URL
- `game:join` → `game:joined` with player info; error if game full or not found
- `game:start` → `game:started` with initial state
- `turn:draw` → `game:state` with updated rack and pool
- `turn:play` → `game:state` with updated board and rack; `move:rejected` on invalid
- `turn:end` → `game:turn` for next player; `move:rejected` if board invalid
- Game state broadcasts to room but rack data only to owning player

**Verification:** `npm test --workspace=packages/server` passes

### Step 8: Client — Socket.IO Context and Routing

Set up the client-side Socket.IO connection and React Router.

**Implement (minimal test):**

- `packages/client/src/socket.ts` — Socket.IO client singleton
- `packages/client/src/hooks/useSocket.ts` — React hook for socket connection
- `packages/client/src/contexts/GameContext.tsx` — game state context
- `packages/client/src/App.tsx` — React Router routes: `/`, `/game/:gameCode`

**Verification:** `npm run build --workspace=packages/client` succeeds

### Step 9: Client — Home Page

Landing page with create/join flows.

**Implement:**

- `packages/client/src/pages/Home.tsx` — "Create Game" button, "Join Game" input with code field, name entry
- On create: emit `game:create`, navigate to lobby
- On join: emit `game:join`, navigate to game

**Verification:** Manual — can create game, see code; can join with code

### Step 10: Client — Lobby Page

Waiting room before game starts.

**Implement:**

- `packages/client/src/pages/Lobby.tsx` — display game code, shareable URL, opponent waiting indicator
- Listen for `game:joined` and `game:started` events
- On `game:started`, navigate to game board

**Verification:** Manual — two players can join, game starts

### Step 11: Client — Game Board Page

Main gameplay screen. Click-to-select tile placement.

**Implement:**

- `packages/client/src/pages/GameBoard.tsx` — orchestrates board, rack, controls
- `packages/client/src/components/Board.tsx` — displays all TileSets on board
- `packages/client/src/components/TileSet.tsx` — renders a single set of tiles
- `packages/client/src/components/Tile.tsx` — single tile with color and value
- `packages/client/src/components/Rack.tsx` — player's hand, horizontally scrollable
- `packages/client/src/components/Pool.tsx` — remaining tile count
- `packages/client/src/components/OpponentInfo.tsx` — opponent name + rack size
- `packages/client/src/components/Controls.tsx` — Draw Tile, End Turn buttons

**Interaction flow (Phase 1 — new sets only):**
1. Player selects tiles from rack (click to toggle selection)
2. Player clicks "Play Selected" → tiles form a new set on the board
3. If first turn, validates initial meld (30+ points)
4. Player clicks "End Turn" to commit
5. Or player clicks "Draw Tile" to draw and pass

**Verification:** Manual — can play tiles, end turn, draw tile, see turns alternate

### Step 12: Client — Game Over Page

End-of-game results.

**Implement:**

- `packages/client/src/pages/GameOver.tsx` — winner announcement, score breakdown, tile counts
- Listen for `game:ended` event

**Verification:** Manual — game ends when a player empties rack, scores shown

### Step 13: Docker Setup

Containerized deployment.

**Files to create:**

- `packages/server/Dockerfile`
- `packages/client/Dockerfile` (multi-stage: build + nginx)
- `docker-compose.yml`
- `packages/client/nginx.conf`

**Verification:** `docker compose up` starts both services, game is playable

## Edge Cases to Handle

1. Joining a game that's already full → error message
2. Joining an invalid game code → error message
3. Playing tiles not from your rack → rejected
4. Playing invalid sets (non-consecutive run, duplicate colors in group) → rejected
5. Initial meld < 30 points → rejected
6. Drawing from empty pool → handle gracefully (game may end)
7. Playing out of turn → rejected
8. Playing when game hasn't started → rejected
9. Ending turn with invalid board state → rejected
10. Only 2 tiles for a set (< 3) → rejected

## Acceptance Criteria

- [ ] Two players can create and join a game via game code
- [ ] Players can enter their names
- [ ] Game starts with 14 tiles each, 76 in pool (104 - 28)
- [ ] Players take turns: draw or play new sets + end turn
- [ ] Initial meld (30+ points) is enforced on first play
- [ ] Invalid moves are rejected with error messages
- [ ] Board always shows valid sets
- [ ] Game ends when a player empties their rack
- [ ] Game ends when pool is empty and player draws (simplified)
- [ ] Scores are calculated and displayed
- [ ] Opponent cannot see other player's tiles
- [ ] All tests pass across all packages
- [ ] Docker setup works

## Validation Steps

1. `npm test` — all tests pass
2. `npm run typecheck` — no type errors
3. `npm run lint` — no lint errors
4. `npm run build` — all packages build
5. Manual smoke test: create game → join → play to completion

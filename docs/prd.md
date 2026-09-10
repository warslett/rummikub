# Rummikub Online - Product Requirements Document

## 1. Overview

A virtual, online Rummikub game that allows 2–4 players to play against each other over the internet in turns. No login required - players create a game, receive a shareable URL, and opponents join by visiting that URL. Each player enters their name before the game begins.

## 2. Rummikub Rules (Sabra Variant)

The official Rummikub rules are maintained in [rules.md](rules.md) as the single source of truth. Refer to that document for all rule definitions, including: game components, setup, valid sets, initial meld, manipulation, jokers, scoring, and time limits.

## 3. Functional Requirements

### 3.1 Game Creation & Joining

| ID | Requirement |
|----|-------------|
| F-01 | A player can create a new game without logging in or registering |
| F-02 | Creating a game generates a random, unique game code (e.g., 6-character alphanumeric) |
| F-03 | The creator receives a game URL in the format `{base_url}/lobby/{game_code}` |
| F-04 | Other players can join by visiting the game URL (up to 4 players total) |
| F-05 | All players must enter their display name before the game begins |
| F-06 | The game can be started by any player once at least 2 players have joined |
| F-07 | If a player visits a game URL that is already full (4 players), they are offered spectator mode instead |
| F-08 | If a player visits an invalid/expired game code, they see a clear error message |

### 3.2 Gameplay

| ID | Requirement |
|----|-------------|
| F-09 | Each player can see their own tiles (on their rack) and all tiles on the board |
| F-10 | Players cannot see their opponent's tiles |
| F-11 | Players take turns. The active player is clearly indicated |
| F-11.1 | Turn rotation works correctly for 2–4 players (circular: 0 → 1 → 2 → 3 → 0) |
| F-12 | On their turn, a player can: draw from the pool, play new sets, add to existing sets, manipulate existing sets, or any combination |
| F-12.1 | When a tile is placed into a set that forms a valid run, the tiles are automatically sorted in ascending value order with jokers in their correct positions; groups are not reordered |
| F-13 | The initial meld requirement (30+ points) is enforced |
| F-14 | The server validates all moves before applying them. Invalid moves are rejected with a clear error message |
| F-14.1 | When board validation fails, invalid sets are highlighted on the board with a red border and a descriptive error label explaining why each set is invalid (e.g., "Needs at least 3 tiles", "Run must have consecutive values", "Group cannot have duplicate colors") |
| F-15 | A player can end their turn only when all board tiles form valid sets |
| F-16 | If a player cannot play, they must draw a tile from the pool (if available) |
| F-17 | The pool tile count is visible to both players |
| F-18 | When a player places their last tile, the game ends and they are declared the winner |
| F-19 | If the pool is empty and no player can make a valid move, the game ends and the player with fewest tiles wins |
| F-19.1 | Stalemate: when the pool is empty, a player may pass their turn; all N players passing consecutively ends the game and the player with the lowest rack value wins (jokers count as 30 points) |
| F-20 | The turn alternates between players automatically |

### 3.3 Scoring & Results

| ID | Requirement |
|----|-------------|
| F-21 | At game end, scores are calculated per the Sabra scoring rules (winner gets sum of all losers' rack values; each loser gets negative of their own rack value) |
| F-22 | Cumulative scores are tracked across multiple rounds between the same players |
| F-23 | After a game ends, players can choose to play another round (scores persist) or leave |
| F-24 | Score history is visible during and after the game |

### 3.4 Reconnection

| ID | Requirement |
|----|-------------|
| F-25 | If a player disconnects (closes browser, loses network), they can reconnect by revisiting the game URL |
| F-26 | Upon reconnection, the player's rack and game state are restored |
| F-27 | The other player is notified when their opponent disconnects and reconnects |
| F-28 | If a player does not reconnect within a reasonable time (5 minutes), the remaining player is offered the option to claim victory |

### 3.5 Spectating

| ID | Requirement |
|----|-------------|
| F-29 | Additional users can join as read-only spectators via the game URL when the game is full |
| F-30 | Spectators can see the board but NOT any player's private rack |
| F-31 | Spectators cannot interact with the game in any way |
| F-32 | Spectators can see whose turn it is and the pool count |

### 3.6 Game Lifecycle

| ID | Requirement |
|----|-------------|
| F-33 | Inactive games (no moves made) expire after 24 hours |
| F-34 | Game state is persisted to PostgreSQL on every change (write-through) |
| F-35 | Games survive server restarts; players reconnect via the game URL and continue where they left off |

### 3.7 Lobby / Home Page

| ID | Requirement |
|----|-------------|
| F-36 | Landing page with "Create Game" button only (no join form on home page; joining is done via the game URL) |
| F-37 | Game creation flow: enter name -> receive game URL/code |
| F-38 | Game joining flow: visit game URL -> enter name -> wait for game to start |
| F-39 | The lobby displays the shareable game URL with a "Copy" button to copy it to the clipboard (clipboard feedback shown on click) |

### 3.8 Auto-Sort

| ID | Requirement |
|----|-------------|
| F-40 | Auto-sort run tiles: when a tile is added to a set that forms a valid run, tiles are automatically sorted in ascending value order with jokers placed correctly; groups are left as-is; sorting applies on both client (immediate visual feedback) and server (authoritative validation) |

### 3.9 AI Opponents

| ID | Requirement |
|----|-------------|
| F-41 | Players can add up to `MAX_PLAYERS - 1` AI opponents in the lobby, each configured with a model name |
| F-42 | AI opponents take turns server-side through the same authoritative game API as human players; AI behaviour is configured via environment variables (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`) |
| F-43 | When `AI_DEBUG=true`, the client shows an AI debug console: AI players in the top player strip are clickable and open a bottom-right panel showing that AI's rack and a readable session transcript (Prompt, Thinking, Tool call, Response items, tool calls by name only); the transcript scrolls back to the start of the round and streams live; full history is served to clients that joined late. The console is available to players and spectators. Showing the AI's rack is a debug-only exception to NF-04 |
| F-44 | AI failures pause the game and surface the error to all players |
| F-45 | The AI conversation is compacted (older exchanges folded into a summary) when it exceeds a configurable token budget, so long games do not blow the model's context window |

#### 3.9.1 LLM agent design (`AI_PROVIDER=llm`)

When it is an AI player's turn, the server runs a **tool-calling agent loop** against the configured OpenAI-compatible chat completions endpoint:

- **System prompt**: the model receives its role ("You are \<playerName\>, an AI player in a game of Rummikub (Sabra variant)"), a condensed ruleset (valid runs/groups, jokers, initial meld 30, must play ≥1 rack tile to end a turn, no loose tiles, draw to pass, stalemate pass rule) and the turn protocol. Strategy hints are kept minimal.
- **Tools map 1:1 to the human verbs**: `get_game_state`, `play_sets`, `manipulate_board`, `undo_turn`, `draw_tile` (turn-ending), `end_turn` (turn-ending, optional `newBoard`), `pass_turn` (turn-ending, only when the pool is empty). The model only ever sees its own `PlayerGameState` (opponents appear as names, rack sizes and scores).
- **Error feedback loop**: every rejected move returns the same error message a human would see as a tool result, so the model can correct itself within the same turn — exactly like a human clicking around the UI.
- **Turn protocol**: a turn must end with exactly one successful turn-ending tool (`draw_tile`, `end_turn` or `pass_turn`); the loop stops as soon as one succeeds.
- **Persistent conversation**: each AI player keeps its own conversation (system prompt + history) per game and round; a turn-start user message with the turn number and a compact note of observable events since the AI's last turn (derived from state diffs, e.g. "Alice drew a tile") is appended before each turn. Conversations are reset on Play Again.
- **Guardrails**: a hard cap of `AI_MAX_TOOL_ITERATIONS` (default 25) tool-call iterations per turn; malformed tool calls and unknown tool names return readable error tool results; two consecutive completions with only malformed calls pause the game. Transient API errors (429, 5xx, network, timeout) are retried with exponential backoff (`AI_MAX_RETRIES`, `AI_RETRY_BASE_MS`); auth and context-length errors pause immediately. Any SDK error or cap breach throws and pauses the game (`ai:error` + stuck banner). Missing `AI_API_KEY` fails fast at the AI's first turn with a clear log line.
- **Compaction**: before each turn the conversation's token count is estimated (`Math.ceil(chars/4)`); if it exceeds `AI_CONTEXT_TOKEN_LIMIT` (default 100000), all but the last `AI_COMPACT_KEEP_TURNS` exchanges are replaced with a model-generated summary plus a fixed note telling the model that board state is authoritative via `get_game_state`. Summarization failure falls back to truncation (`compaction_fallback`) instead of pausing. Compaction is transparent to the model conversation only; the debug transcript buffer is append-only and never compacted.
- **Debug console (replaces server-side logging)**: when `AI_DEBUG=true`, transcript items (Prompt, Thinking, Tool call, Response — readable text only, tool calls by name) are recorded server-side at the points where messages enter the conversation, buffered in memory per game/round/player (append-only for the round, unaffected by compaction), and broadcast live to the game room as `ai:debug` events; clients request the full round history via `ai:debugHistory` when the console opens. An `aiDebug` flag in `game:state` tells clients whether AI players are clickable. When off (default): no events, no buffer, no history endpoint, AI players are not clickable.

### 3.10 Persistent Storage

| ID | Requirement |
|----|-------------|
| F-53 | Full game state (racks, board, pool, scores, turn snapshot, turn actions, phase, round number) persists to PostgreSQL on every mutation |
| F-54 | The 24-hour inactivity expiry deletes persisted games from the database as well as from memory |
| F-55 | AI conversation/session, turn tracking, AI errors and debug transcripts survive restarts — delivered by Plan B |
| F-56 | Persistence is enabled by default via `DATABASE_URL`; unsetting it runs the server in-memory only |

## 4. Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NF-01 | **Responsive**: UI must work on desktop and mobile devices (responsive design) |
| NF-02 | **Real-time**: State changes propagate to all connected clients within 500ms |
| NF-03 | **Concurrency**: Support at least 50 concurrent games on a single server instance |
| NF-04 | **Security**: Players cannot see opponent tiles via network inspection (tiles are never sent to non-owning clients; debug-only exception: when `AI_DEBUG=true`, an AI player's rack is visible in the debug console — see F-43) |
| NF-05 | **Integrity**: All game logic runs server-side; client is a thin UI layer |
| NF-06 | **Accessibility**: Basic keyboard navigation and screen reader support |
| NF-07 | **Visual style**: Traditional board game feel - mimics physical game with tile racks and table surface |

## 5. Technology & Architecture

### 5.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (shared) | Type safety across full stack, shared type definitions |
| Backend | Node.js + Express | Mature ecosystem, excellent WebSocket support |
| Real-time | Socket.IO | Auto-reconnection, room support, fallback transports, broadcast to rooms |
| Frontend | React + Vite | Component-based UI, fast dev server, large ecosystem |
| Styling | CSS Modules or Tailwind | Scoped styles, responsive design support |
| Persistence | PostgreSQL (via `pg`) | Write-through game-state persistence; full `GameState` snapshots stored as JSONB, one row per game |
| Deployment | Docker | Containerized, deployable to any cloud platform |

### 5.2 Architecture: Server-Authoritative

```
┌─────────────┐         Socket.IO          ┌─────────────────┐
│   Client A  │◄──────────────────────────►│                 │
│  (React)    │                            │   Game Server   │
│             │                            │   (Node.js)     │
├─────────────┤                            │                 │
│   Client B  │◄──────────────────────────►│  - Validates    │
│  (React)    │                            │    all moves    │
├─────────────┤                            │  - Manages      │
│  Client C/D │◄──────────────────────────►│    game state   │
│  (React)    │                            │  - Broadcasts   │
├─────────────┤                            │    state changes│
│  Spectator  │◄─── read-only broadcast ───│                 │
│  (React)    │                            │                 │
└─────────────┘                            └─────────────────┘
```

**Key principle**: The server is the single source of truth. Clients never compute game logic; they only render state and send player actions.

### 5.3 Communication Protocol

#### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game:create` | `{ playerName }` | Create a new game |
| `game:join` | `{ gameCode, playerName }` | Join an existing game |
| `game:reconnect` | `{ gameCode, playerId }` | Reconnect to a game |
| `game:spectate` | `{ gameCode }` | Join as spectator |
| `game:start` | `{ gameCode }` | Signal readiness to start |
| `turn:draw` | `{}` | Draw a tile from the pool |
| `turn:play` | `{ actions: Action[] }` | Submit a set of tile actions |
| `turn:manipulate` | `{ newBoard: TileSet[] }` | Submit manipulated board state |
| `turn:end` | `{ newBoard?: TileSet[] }` | End turn (confirm board state; optional newBoard for inline manipulation) |
| `turn:undo` | `{}` | Undo all moves made this turn |
| `turn:pass` | `{}` | Pass turn when pool is empty (contributes to stalemate detection) |
| `game:playAgain` | `{}` | Start a new round after game ends (scores persist) |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game:created` | `{ gameCode, gameUrl, playerId }` | Game created confirmation |
| `game:joined` | `{ playerId, opponentName }` | Opponent joined |
| `game:started` | `{ gameState }` | Game begins |
| `game:state` | `{ board, pool, yourRack, opponentRackSize, scores, currentTurn, hasPlayedThisTurn, roundNumber, yourGamesWon, opponentGamesWon, opponentConnected, consecutivePasses }` | Full state update |
| `game:turn` | `{ player }` | It's a player's turn |
| `move:rejected` | `{ reason }` | Move was invalid |
| `game:ended` | `{ winner, scores, roundNumber, isStalemate, gamesWon }` | Game over |
| `player:disconnected` | `{ player }` | Opponent disconnected |
| `player:reconnected` | `{ player }` | Opponent reconnected |
| `game:error` | `{ message }` | Generic error |

### 5.4 Project Structure

```
rummikub/
├── docs/
│   └── prd.md
├── packages/
│   ├── shared/              # Shared types, constants, validation
│   │   ├── src/
│   │   │   ├── types.ts     # Game, Tile, Set, Player types
│   │   │   ├── constants.ts # Colors, values, game rules
│   │   │   └── validation.ts# Move validation logic (used server-side)
│   │   └── package.json
│   ├── server/              # Backend
│   │   ├── src/
│   │   │   ├── index.ts     # Entry point, Express + Socket.IO setup
│   │   │   ├── game.ts      # Game state machine
│   │   │   ├── gameManager.ts # Manages all active games
│   │   │   ├── storage/     # PostgreSQL persistence (config, db, game store)
│   │   │   ├── handlers/    # Socket.IO event handlers
│   │   │   └── utils/       # Helpers (game code gen, etc.)
│   │   ├── Dockerfile
│   │   └── package.json
│   └── client/              # Frontend
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/  # React components
│       │   │   ├── Board.tsx
│       │   │   ├── Rack.tsx
│       │   │   ├── Tile.tsx
│       │   │   ├── Pool.tsx
│       │   │   ├── ScoreBoard.tsx
│       │   │   └── ...
│       │   ├── hooks/       # Custom React hooks
│       │   ├── pages/       # Page-level components
│       │   │   ├── Home.tsx
│       │   │   ├── Game.tsx
│       │   │   └── Lobby.tsx
│       │   └── socket.ts    # Socket.IO client setup
│       ├── Dockerfile
│       └── package.json
├── docker-compose.yml
├── package.json              # Workspace root
└── README.md
```

### 5.5 Game State Model

```typescript
interface Tile {
  id: string;        // Unique identifier (e.g., "red-7-a", "joker-1")
  color: 'red' | 'blue' | 'orange' | 'black' | 'joker';
  value: number;     // 1-13, or 0 for jokers
}

interface TileSet {
  id: string;
  type: 'run' | 'group';
  tiles: Tile[];
}

interface TurnSnapshot {
  board: TileSet[];
  rack: Tile[];
}

interface Player {
  id: string;
  name: string;
  rack: Tile[];
  hasInitialMeld: boolean;
  score: number;
  connected: boolean;
  gamesWon: number;
}

type GamePhase = 'lobby' | 'playing' | 'ended';

interface GameState {
  id: string;               // Game code
  phase: GamePhase;
  players: Player[];
  currentTurnIndex: number;
  board: TileSet[];         // All sets on the board
  pool: Tile[];             // Remaining tiles to draw
  turnActions: TurnAction[];// Actions taken this turn (for undo)
  turnSnapshot: TurnSnapshot | null; // Snapshot at turn start for undo
  roundNumber: number;      // Current round (increments on Play Again)
  consecutivePasses: number;// Tracks passes for stalemate detection
  createdAt: number;        // Timestamp
  lastActivityAt: number;   // For expiry
}

type TurnAction =
  | { type: 'placeSet'; tiles: Tile[] }
  | { type: 'draw' }
  | { type: 'manipulate' }
  | { type: 'pass' };
```

### 5.6 Key Design Decisions

1. **Turn-based action model**: On their turn, a player submits a series of actions (place tile, manipulate board, etc.). The server validates the entire turn's result before committing. The client provides an "undo" function to revert uncommitted actions within the current turn via a turn snapshot captured at turn start.

2. **Separate rack state from board state**: The player's rack is never sent to the opponent. The opponent only knows the rack size.

3. **Socket.IO rooms**: Each game is a Socket.IO room. Broadcasts for game state go to the room, but rack data is sent only to the owning player.

4. **Game code generation**: 6-character alphanumeric code, excluding ambiguous characters (0/O, 1/I/l). ~1.5 billion possible codes.

5. **Write-through persistence**: Every game mutation persists the full `GameState` snapshot to PostgreSQL (JSONB, one row per game, updated in place). The in-memory `Map<string, Game>` remains the working cache; games are restored from the database on boot. When `DATABASE_URL` is unset, the server runs in-memory only (no database).

6. **Spectator via same room**: Spectators join the Socket.IO room but receive a filtered state (no rack data).

7. **Board manipulation**: Players submit the entire resulting board state; the server validates all sets are valid and that no tiles appeared from nowhere. Joker retrieval requires playing at least one rack tile.

8. **Stalemate via consecutive passes**: When the pool is empty, a player may pass their turn. All N players passing consecutively ends the game; the player with the lowest rack value wins. Jokers in the rack count as 30 points each for this calculation.

9. **Auto-sort on placement**: When a tile is added to a set, runs are automatically sorted in ascending value order with jokers in correct positions. This eliminates the need to click the precise insertion point. Sorting happens on both the client (immediate visual feedback) and the server (authoritative validation before checking board validity). Groups are never reordered.

10. **Multi-player (2–4)**: No pre-selection of player count. Up to 4 players can join via the game URL. Any player can start the game once 2+ have joined. A 5th visitor is offered spectator mode. Turn rotation, scoring, and stalemate all support 2–4 players.

## 6. UI/UX Design Notes

### 6.1 Visual Style: Traditional Board Game

- Table surface texture (wood or felt green) as background
- Tiles styled to resemble physical Rummikub tiles with rounded corners, embossed numbers
- Player rack at the bottom of the screen (horizontal scroll on mobile)
- Board area in the center displaying all current sets
- Pool indicator in the corner showing remaining tiles
- Score display visible at all times
- Opponent's rack shown face-down (just showing count)

### 6.2 Key Screens

1. **Home page**: Simple landing with "Create Game" button only
2. **Lobby**: Waiting for opponent, showing game code, shareable URL, and "Copy" button
3. **Game board**: Main gameplay screen with rack, board, pool, scores
4. **Game over**: Results, scores, "Play Again" option

### 6.3 Interactions

- **Drag and drop** tiles from rack to board / between sets
- **Touch support** for mobile (tap to select, tap destination to place)
- **Undo button** to revert all uncommitted moves in current turn
- **End Turn button** to submit moves
- **Draw Tile button** when choosing to draw instead of play
- Visual highlighting of valid placement targets

## 7. Future Considerations (Out of Scope for MVP)

These features are explicitly deferred but should be considered in architecture decisions:

- In-game chat
- AI opponent / practice mode
- User accounts and game history
- Tournament / ranked play
- Sound effects and animations
- Multiple rule variants (French, International)
- River/Draw-Two variant
- Turn timer (configurable)
- Game replay

## 8. Milestones

### Phase 1: Foundation (MVP)

- [x] Project scaffolding (monorepo, TypeScript, Vite, Express, Socket.IO, Tailwind)
- [x] Shared types and constants
- [x] Game state machine (server-side logic)
- [x] Move validation (server-side)
- [x] Basic UI: home page, lobby, game board
- [x] Tile rendering and rack display
- [x] Board display with sets
- [x] Turn-based gameplay: draw, play sets, end turn
- [x] Initial meld enforcement (30-point rule)
- [x] Game creation with code generation
- [x] Game joining via URL
- [x] Player name entry
- [x] Game over detection and scoring
- [x] Docker setup

> **Scope decisions for Phase 1**: Single round only (no "Play Again" or cumulative scoring). Tile placement via click-to-select (no drag-and-drop).

### Phase 2: Core Gameplay

- [x] Tile manipulation (rearranging existing sets — extend, split, shift, substitute)
- [x] Undo within a turn (board and rack snapshot at turn start; undo reverts all changes)
- [x] Joker handling (2 joker tiles added back, joker-aware validation, retrieval requires playing a rack tile, 30-point penalty in scoring)
- [x] Cumulative scoring across rounds (scores and games-won persist; Play Again starts new round)
- [x] Reconnection support (disconnected players rejoin via game:reconnect; localStorage saves playerId/gameCode)
- [x] Disconnect notification (opponent sees disconnect/reconnect events)
- [x] Inactivity expiry (24 hours; periodic cleanup via GameManager)
- [x] Stalemate detection (consecutive passes when pool is empty end the game; lowest rack value wins)

### Phase 3: Extended Features

- [x] Spectator mode
- [x] 3-4 player support
- [x] Auto-sort run tiles after placement
- [x] Invalid set feedback (highlighting + descriptive error messages per set)
- [x] Visual polish (traditional board game feel)

### Phase 4: Future

- [x] AI opponent (delivered across plans 011-013: infrastructure, LLM provider, robustness)
- [ ] Drag-and-drop tile placement
- [ ] Chat
- [ ] Valid move highlighting
- [ ] Touch support
- [x] Persistent storage (game state — F-34/F-35/F-53..F-56; AI session persistence is a follow-up)
- [ ] Turn timer
- [ ] Sound effects / animations
- [ ] Accessibility improvements

## See Also

- [rules.md](rules.md) — MUST read before making or planning changes to game behaviour or dynamics. Contains the full official Rummikub rules.
- [entities.md](entities.md) — MUST read when trying to understand game data structures, entities and relationships.
- [coding.md](coding.md) — MUST read before making code changes. Contains TDD process, code style, and architecture rules.
- [planning.md](planning.md) — MUST read before creating any plans for features or changes.
- [testing.md](testing.md) — MUST read before writing or running tests.

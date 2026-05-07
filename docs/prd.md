# Rummikub Online - Product Requirements Document

## 1. Overview

A virtual, online Rummikub game that allows two players to play against each other over the internet in turns. No login required - players create a game, receive a shareable URL with a game code, and an opponent joins by visiting that URL. Each player enters their name before the game begins.

## 2. Rummikub Rules (Sabra Variant)

The official Rummikub rules are maintained in [rules.md](rules.md) as the single source of truth. Refer to that document for all rule definitions, including: game components, setup, valid sets, initial meld, manipulation, jokers, scoring, and time limits.

## 3. Functional Requirements

### 3.1 Game Creation & Joining

| ID | Requirement |
|----|-------------|
| F-01 | A player can create a new game without logging in or registering |
| F-02 | Creating a game generates a random, unique game code (e.g., 6-character alphanumeric) |
| F-03 | The creator receives a game URL in the format `{base_url}/game/{game_code}` |
| F-04 | Another player can join by visiting the game URL |
| F-05 | Both players must enter their display name before the game begins |
| F-06 | The game starts only when both players have entered their names and confirmed readiness |
| F-07 | If a player visits a game URL that is already full (2 players), they are offered spectator mode instead |
| F-08 | If a player visits an invalid/expired game code, they see a clear error message |

### 3.2 Gameplay

| ID | Requirement |
|----|-------------|
| F-09 | Each player can see their own tiles (on their rack) and all tiles on the board |
| F-10 | Players cannot see their opponent's tiles |
| F-11 | Players take turns. The active player is clearly indicated |
| F-12 | On their turn, a player can: draw from the pool, play new sets, add to existing sets, manipulate existing sets, or any combination |
| F-13 | The initial meld requirement (30+ points) is enforced |
| F-14 | The server validates all moves before applying them. Invalid moves are rejected with a clear error message |
| F-15 | A player can end their turn only when all board tiles form valid sets |
| F-16 | If a player cannot play, they must draw a tile from the pool (if available) |
| F-17 | The pool tile count is visible to both players |
| F-18 | When a player places their last tile, the game ends and they are declared the winner |
| F-19 | If the pool is empty and no player can make a valid move, the game ends and the player with fewest tiles wins |
| F-19.1 | Stalemate: when the pool is empty, a player may pass their turn; two consecutive passes end the game and the player with the lowest rack value wins (jokers count as 30 points) |
| F-20 | The turn alternates between players automatically |

### 3.3 Scoring & Results

| ID | Requirement |
|----|-------------|
| F-21 | At game end, scores are calculated per the Sabra scoring rules |
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
| F-34 | Game state is held in server memory only - no database persistence for MVP |
| F-35 | Game state is lost on server restart (acceptable for MVP) |

### 3.7 Lobby / Home Page

| ID | Requirement |
|----|-------------|
| F-36 | Landing page with "Create Game" button (no join form on home page) |
| F-37 | Game creation flow: enter name -> receive game URL/code |
| F-38 | Game joining flow: visit game URL -> enter name -> wait for game to start |
| F-39 | The lobby displays the shareable game URL with a "Copy" button to copy it to the clipboard |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | **Responsive**: UI must work on desktop and mobile devices (responsive design) |
| NF-02 | **Real-time**: State changes propagate to all connected clients within 500ms |
| NF-03 | **Concurrency**: Support at least 50 concurrent games on a single server instance |
| NF-04 | **Security**: Players cannot see opponent tiles via network inspection (tiles are never sent to non-owning clients) |
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
| Deployment | Docker | Containerized, deployable to any cloud platform |

### 5.2 Architecture: Server-Authoritative

```
┌─────────────┐         Socket.IO         ┌─────────────────┐
│   Client A  │◄──────────────────────────►│                 │
│  (React)    │                            │   Game Server   │
│             │                            │   (Node.js)     │
├─────────────┤                            │                 │
│   Client B  │◄──────────────────────────►│  - Validates    │
│  (React)    │                            │    all moves    │
│             │                            │  - Manages      │
├─────────────┤                            │    game state   │
│  Spectator  │◄─── read-only broadcast ──│  - Broadcasts   │
│  (React)    │                            │    state changes│
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

5. **No database**: All state in memory for MVP. A Map<string, GameState> in the server process.

6. **Spectator via same room**: Spectators join the Socket.IO room but receive a filtered state (no rack data).

7. **Board manipulation**: Players submit the entire resulting board state; the server validates all sets are valid and that no tiles appeared from nowhere. Joker retrieval requires playing at least one rack tile.

8. **Stalemate via consecutive passes**: When the pool is empty, a player may pass their turn. Two consecutive passes end the game; the player with the lowest rack value wins. Jokers in the rack count as 30 points each for this calculation.

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
- 3-4 player support
- AI opponent / practice mode
- User accounts and game history
- Persistent storage (database)
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
- [ ] 3-4 player support
- [ ] Valid move highlighting
- [ ] Visual polish (traditional board game feel)

### Phase 4: Future

- [ ] Chat
- [ ] Drag-and-drop tile placement
- [ ] Touch support
- [ ] AI opponent
- [ ] Persistent storage
- [ ] Turn timer
- [ ] Sound effects / animations
- [ ] Accessibility improvements

## See Also

- [rules.md](rules.md) — MUST read before making or planning changes to game behaviour or dynamics. Contains the full official Rummikub rules.
- [entities.md](entities.md) — MUST read when trying to understand game data structures, entities and relationships.
- [coding.md](coding.md) — MUST read before making code changes. Contains TDD process, code style, and architecture rules.
- [planning.md](planning.md) — MUST read before creating any plans for features or changes.
- [testing.md](testing.md) — MUST read before writing or running tests.

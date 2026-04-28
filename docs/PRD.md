# Rummikub Online - Product Requirements Document

## 1. Overview

A virtual, online Rummikub game that allows two players to play against each other over the internet in turns. No login required - players create a game, receive a shareable URL with a game code, and an opponent joins by visiting that URL. Each player enters their name before the game begins.

## 2. Rummikub Rules (Sabra Variant)

### 2.1 Game Components

- **106 tiles total**: 104 numbered tiles + 2 joker tiles
- Numbered tiles: values 1-13 in 4 colors (blue, red, orange, black), 2 copies of each
- Jokers: 2 wild tiles that can substitute for any tile

### 2.2 Setup

1. All tiles are shuffled and placed face-down (the "pool")
2. Each player draws 14 tiles and places them on their rack (hidden from opponent)
3. The player with the highest-value drawn tile goes first
4. Play proceeds clockwise (alternating turns for 2 players)

### 2.3 Valid Sets

All tiles on the board must be arranged in sets of **at least 3 tiles**. Two types:

- **Run**: 3+ consecutive numbers of the same color (e.g., blue 3-4-5-6). A 1 may not follow a 13.
- **Group**: 3-4 tiles of the same value in distinct colors (e.g., red 7, blue 7, black 7). Colors may not repeat in a group.

### 2.4 Initial Meld

- A player's first play of the game must be a valid set (or sets) from their own rack totaling **at least 30 points**
- Jokers in the initial meld assume the value of the tile they replace
- A player may NOT use tiles already on the board for their initial meld
- If a player cannot make an initial meld, they must draw one tile from the pool and their turn ends

### 2.5 Subsequent Turns

After making their initial meld, a player may on their turn:

- Play one or more tiles from their rack to form new sets
- Add tiles to existing sets on the board
- **Manipulate** existing sets on the board (see 2.6)
- Combine any of the above actions

If a player cannot or chooses not to play, they must draw one tile from the pool and their turn ends.

### 2.6 Manipulating Existing Sets

A core Rummikub mechanic. During a turn, a player may rearrange tiles already on the board:

- **Shifting a run**: Add a tile to one end of a run and remove a tile from the other end for use elsewhere
- **Splitting a run**: Split a long run and insert matching tiles in the middle (e.g., blue 6-7-8-9-10 split with own 8 to make 6-7-8 and 8-9-10)
- **Substituting in a group**: Replace a tile in a 3-tile group with the fourth color of the same value, taking the replaced tile for use elsewhere
- **Removing tiles**: Remove a tile from the end of a run (remaining tiles must still form a valid run), or remove any one tile from a 4-tile group
- **Joker substitution**: Replace a joker in a set with the tile it represents (same value and color). The freed joker must be used in the same turn as part of a new set. A joker cannot be retrieved before the initial meld.

**Critical rule**: At the end of a player's turn, ALL tiles on the board must form valid sets. Any tile "harvested" from an existing set must be played during that turn - it cannot be kept for later.

### 2.7 Invalid Moves

- Server will validate all moves and prevent invalid states
- A move is invalid if it would leave any set on the board with fewer than 3 tiles
- A move is invalid if it would leave tiles not part of any valid set
- A move is invalid if a player tries to play tiles before making their initial meld (30+ point requirement)
- The server rejects invalid moves and the player's turn continues (they must make a valid move or draw)

### 2.8 Winning

- A player wins by placing all tiles from their rack onto the board, declaring "Rummikub!"
- If the pool is exhausted and no player can make a valid move, the player with the fewest tiles in their rack wins

### 2.9 Scoring

- **Winner**: Receives the sum of all other players' remaining tile values (added to cumulative score)
- **Losers**: Subtract the total value of tiles remaining in their rack from their cumulative score
- **Joker penalty**: A joker remaining in a player's rack counts as 30 points
- If a player never made their initial meld, their remaining tile values are added to every other player's score, and the highest cumulative score wins

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
| F-36 | Landing page with "Create Game" button |
| F-37 | Game creation flow: enter name -> receive game URL/code |
| F-38 | Game joining flow: visit URL -> enter name -> wait for game to start |

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
| `turn:end` | `{}` | End turn (confirm board state) |
| `turn:undo` | `{}` | Undo all moves made this turn |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game:created` | `{ gameCode, gameUrl, playerId }` | Game created confirmation |
| `game:joined` | `{ playerId, opponentName }` | Opponent joined |
| `game:started` | `{ gameState }` | Game begins |
| `game:state` | `{ board, pool, yourRack, opponentRackSize, scores, currentTurn }` | Full state update |
| `game:turn` | `{ player }` | It's a player's turn |
| `move:rejected` | `{ reason }` | Move was invalid |
| `game:ended` | `{ winner, scores }` | Game over |
| `player:disconnected` | `{ player }` | Opponent disconnected |
| `player:reconnected` | `{ player }` | Opponent reconnected |
| `game:error` | `{ message }` | Generic error |

### 5.4 Project Structure

```
rummikub/
├── docs/
│   └── PRD.md
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

// Note: Phase 1 excludes jokers. The 'joker' color and value 0 are defined
// in the type for forward compatibility but are not generated in tile sets.

interface TileSet {
  id: string;
  type: 'run' | 'group';
  tiles: Tile[];
}

interface Player {
  id: string;
  name: string;
  rack: Tile[];
  hasInitialMeld: boolean;
  score: number;
  connected: boolean;
}

type GamePhase = 'lobby' | 'playing' | 'ended';

interface GameState {
  id: string;               // Game code
  phase: GamePhase;
  players: Player[];
  currentTurnIndex: number;
  board: TileSet[];         // All sets on the board
  pool: Tile[];             // Remaining tiles to draw
  turnActions: Action[];    // Actions taken this turn (for undo)
  createdAt: number;        // Timestamp
  lastActivityAt: number;   // For expiry
}
```

### 5.6 Key Design Decisions

1. **Turn-based action model**: On their turn, a player submits a series of actions (place tile, move tile, etc.). The server validates the entire turn's result before committing. The client provides an "undo" function to revert uncommitted actions within the current turn.

2. **Separate rack state from board state**: The player's rack is never sent to the opponent. The opponent only knows the rack size.

3. **Socket.IO rooms**: Each game is a Socket.IO room. Broadcasts for game state go to the room, but rack data is sent only to the owning player.

4. **Game code generation**: 6-character alphanumeric code, excluding ambiguous characters (0/O, 1/I/l). ~1.5 billion possible codes.

5. **No database**: All state in memory for MVP. A Map<string, GameState> in the server process.

6. **Spectator via same room**: Spectators join the Socket.IO room but receive a filtered state (no rack data).

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

1. **Home page**: Simple landing with "Create Game" button and "Join Game" input (enter code)
2. **Lobby**: Waiting for opponent, showing game code and shareable URL
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

> **Scope decisions for Phase 1**: Jokers excluded (106→104 tiles, no joker handling). Single round only (no "Play Again" or cumulative scoring). Tile placement via click-to-select (no drag-and-drop). Tile manipulation of existing board sets deferred to Phase 2.

### Phase 2: Core Gameplay

- [ ] Tile manipulation (rearranging existing sets)
- [ ] Undo within a turn
- [ ] Joker handling (joker tiles added back, substitution and retrieval rules)
- [ ] Cumulative scoring across rounds
- [ ] Reconnection support
- [ ] Disconnect notification
- [ ] Inactivity expiry (24 hours)

### Phase 3: Polish

- [ ] Spectator mode
- [ ] Mobile-responsive layout
- [ ] Drag-and-drop tile placement
- [ ] Touch support
- [ ] Valid move highlighting
- [ ] Visual polish (traditional board game feel)
- [ ] Accessibility improvements

### Phase 4: Future

- [ ] Chat
- [ ] 3-4 player support
- [ ] AI opponent
- [ ] Persistent storage
- [ ] Turn timer
- [ ] Sound effects / animations

# Phase 1 Manual Test Plan

## Prerequisites

- `docker compose up --build` is running
- Server accessible at `http://localhost:3000`
- Client accessible at `http://localhost:5173`
- Two browser windows (regular + incognito, or two different browsers)

---

## 1. Home Page

### TC-01: Home page loads

**Steps:**
1. Navigate to `http://localhost:5173`

**Expected:**
- Page renders with "Rummikub" heading
- "Your Name" input field is visible
- "Create Game" button is visible and disabled (no name entered)
- "Game Code" input field and "Join Game" button are visible

### TC-02: Create Game button enables with name

**Steps:**
1. Type a name into the "Your Name" field

**Expected:**
- "Create Game" button becomes enabled

### TC-03: Join Game button requires both name and code

**Steps:**
1. Leave "Your Name" empty, type a code into "Game Code"
2. Clear the code, type a name only

**Expected:**
- "Join Game" button is disabled in both cases
- "Join Game" button only enables when both fields have values

---

## 2. Game Creation

### TC-04: Create a game successfully

**Steps:**
1. Enter "Alice" in "Your Name"
2. Click "Create Game"

**Expected:**
- Navigates to the Lobby page
- A 6-character game code is displayed (uppercase alphanumeric, no 0/O/1/I/l)
- "Waiting for opponent..." text is shown
- No "Start Game" button yet (opponent hasn't joined)

### TC-05: Join with invalid game code

**Steps:**
1. Open a second browser window
2. Enter "Bob" in "Your Name"
3. Type "ZZZZZZ" in "Game Code"
4. Click "Join Game"

**Expected:**
- An error message appears ("Game not found")
- User stays on the home page

---

## 3. Game Joining

### TC-06: Join a game successfully

**Steps:**
1. Window 1: Create a game as Alice (note the game code)
2. Window 2: Enter "Bob" in "Your Name", enter the game code, click "Join Game"

**Expected:**
- Window 2 navigates to the Lobby page showing the game code
- Window 1 updates to show "Opponent: Bob" and a green "Start Game" button appears

### TC-07: Cannot join a full game

**Steps:**
1. Create and join a game as above (2 players already in)
2. Window 3: Enter "Charlie" in "Your Name", enter the same game code, click "Join Game"

**Expected:**
- An error message appears ("Game is full")
- Charlie does not join the game

### TC-08: Join game via direct URL

**Steps:**
1. Window 1: Create a game as Alice
2. Window 2: Navigate directly to `http://localhost:5173/game/GAMECODE`
3. Enter "Bob" in "Your Name", click "Join Game"

**Expected:**
- Window 2 shows the game code and joins the lobby
- Window 1 shows "Opponent: Bob"

---

## 4. Game Start

### TC-09: Start game successfully

**Steps:**
1. Create a game as Alice
2. Join as Bob
3. Window 1: Click "Start Game"

**Expected:**
- Both windows navigate to the game board
- Both players see 14 tiles in their rack
- The pool count shows 76 (104 − 28)
- One player sees "Your turn" indicator, the other sees the opponent's name's turn
- The initial meld message ("first play must total 30+ points") is shown for the player whose turn it is (if they haven't melded yet)

### TC-10: Cannot start with only one player

**Steps:**
1. Create a game as Alice
2. Do not join as a second player
3. Click "Start Game" (if the button is visible)

**Expected:**
- Game does not start (button should not appear until opponent joins)

---

## 5. Turn-Based Gameplay

### TC-11: Draw a tile on your turn

**Steps:**
1. Start a game
2. The player whose turn it is: click "Draw Tile"

**Expected:**
- One tile is added to the player's rack (rack size increases by 1)
- Pool count decreases by 1
- Turn switches to the opponent
- Opponent now sees "Your turn" indicator

### TC-12: Cannot draw on opponent's turn

**Steps:**
1. Start a game
2. The player whose turn it is NOT: click "Draw Tile"

**Expected:**
- "Draw Tile" button is not visible or not clickable (the controls area should show "Waiting for opponent...")

### TC-13: Play a valid set (initial meld)

**Steps:**
1. Start a game
2. The player whose turn it is: click to select 3+ tiles from the rack that form a valid run or group worth 30+ points
3. Click "Play Selected"
4. Click "End Turn"

**Expected:**
- The selected tiles are removed from the rack
- The set appears on the board
- The "initial meld" message no longer appears for this player
- Turn switches to the opponent

### TC-14: Initial meld rejected if under 30 points

**Steps:**
1. Start a game
2. Select 3 tiles that form a valid set but total less than 30 points (e.g., a run of 1-2-3 = 6 points)
3. Click "Play Selected"

**Expected:**
- An error message appears: "Initial meld must be at least 30 points"
- Tiles remain in the player's rack
- Nothing is added to the board

### TC-15: Cannot play tiles not from your rack

**Steps:**
1. Start a game (this should be handled by the UI only allowing selection from rack)

**Expected:**
- Player can only select tiles from their own rack
- No way to submit tiles that don't belong to the player

### TC-16: Turn alternates after draw

**Steps:**
1. Start a game
2. Player 1 draws a tile
3. Player 2 draws a tile
4. Player 1 draws a tile

**Expected:**
- After each draw, the turn indicator switches between players
- The active player's controls (Draw Tile, Play Selected, End Turn) are visible
- The inactive player sees "Waiting for opponent..."

### TC-17: Play a valid set after initial meld

**Steps:**
1. Player 1 completes their initial meld (play a valid 30+ point set and end turn)
2. Player 2 draws (or plays their own initial meld)
3. Player 1's next turn: select and play any valid set (no minimum point requirement)

**Expected:**
- Player 1 can play a set worth any number of points (no 30-point minimum)
- The set appears on the board

### TC-18: Select fewer than 3 tiles

**Steps:**
1. Start a game
2. Select only 1 or 2 tiles from the rack
3. Click "Play Selected"

**Expected:**
- "Play Selected" button is disabled (shows count < 3)

---

## 6. Game Over

### TC-19: Game ends when a player empties their rack

**Steps:**
1. Start a game
2. Play through turns, placing sets until one player has no tiles left
3. End the turn after placing the last tile(s)

**Expected:**
- Both players see a "Game Over" screen
- The winner is announced ("You Win!" for the winner, "[Name] Wins!" for the loser)
- Scores are displayed (winner gets positive, loser gets negative)

### TC-20: Scoring calculation

**Steps:**
1. End a game where the loser has tiles remaining in their rack

**Expected:**
- Winner's score = sum of all tile values in the loser's rack
- Loser's score = negative of the sum of tile values in their rack

---

## 7. Board Display

### TC-21: Board shows played sets

**Steps:**
1. Play one or more valid sets onto the board

**Expected:**
- Each set is displayed as a group of tiles
- Runs show tiles in consecutive order with the same color
- Groups show tiles of the same value with different colors
- Tiles are colored appropriately (red, blue, orange, black)

### TC-22: Rack display

**Steps:**
1. Start a game

**Expected:**
- Player sees their own tiles with colors and values
- Opponent's tiles are NOT visible
- Opponent's rack size is shown as a number

### TC-23: Pool count is visible

**Steps:**
1. Start a game
2. Draw a tile

**Expected:**
- Pool count starts at 76
- Pool count decreases by 1 after each draw
- Both players see the same pool count

---

## 8. Error Handling

### TC-24: Invalid game URL

**Steps:**
1. Navigate to `http://localhost:5173/game/INVALID`

**Expected:**
- Lobby or join page loads; entering a name and clicking "Join Game" should show "Game not found" error

### TC-25: Move rejection feedback

**Steps:**
1. Attempt to play an invalid set (e.g., select 3 tiles that don't form a valid run or group)

**Expected:**
- Error message appears briefly explaining why the move was rejected
- Error message disappears after a few seconds
- Game state is unchanged

---

## 9. Disconnect (Basic)

### TC-26: Player disconnects by closing browser

**Steps:**
1. Start a game
2. One player closes their browser window

**Expected:**
- The remaining player's screen shows no immediate crash or error
- The game continues to function for the connected player (they can still see the board and their rack)

---

## 10. Docker Deployment

### TC-27: Docker Compose starts both services

**Steps:**
1. Run `docker compose up --build`
2. Verify both containers are running

**Expected:**
- `rummikub-server-1` is running and logs "Rummikub server listening on port 3000"
- `rummikub-client-1` is running
- `http://localhost:3000/health` returns `{"status":"ok"}`
- `http://localhost:5173` loads the client

### TC-28: Server restarts with no persisted state

**Steps:**
1. Create and start a game
2. Run `docker compose restart server`
3. Try to continue the game

**Expected:**
- Game state is lost after server restart (acceptable for MVP)
- Client may show errors or need to refresh

# @rummikub/client

React SPA frontend — thin UI layer that displays game state and sends player actions to the server via Socket.IO. No authoritative game logic.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/App.tsx` | Root component — global state, Socket.IO listeners, routing (`/`, `/lobby/:code`, `/game/:code`, `/game-over`) |
| `src/socket.ts` | Socket.IO client instance (connects to `VITE_SERVER_URL`) |
| `src/contexts/GameContext.tsx` | React context: `gameState`, `playerId`, `gameCode`, `error` + `useGame()` hook |
| `src/pages/Home.tsx` | Landing page — create or join a game |
| `src/pages/Lobby.tsx` | Waiting room — share game code, wait for opponent, start game |
| `src/pages/GameBoard.tsx` | Main game — tile selection, board manipulation, turn actions, client-side pre-validation |
| `src/pages/GameOver.tsx` | End screen — scores, games won, Play Again |
| `src/components/GameBoard.tsx` | Presentational: `TileComponent`, `TileSetComponent`, `Board`, `Rack`, `Pool`, `OpponentInfo`, `Controls` |

## Directory Structure

```
src/
  main.tsx              — React entry point
  App.tsx               — Root component + routing
  socket.ts             — Socket.IO client
  index.css             — Tailwind import
  contexts/
    GameContext.tsx      — Game state context
  pages/
    Home.tsx            — Create/join game
    Lobby.tsx           — Waiting room
    GameBoard.tsx       — Main game board
    GameOver.tsx        — Results screen
  components/
    GameBoard.tsx       — Presentational tile/board/rack components
```

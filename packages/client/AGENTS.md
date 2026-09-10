# @rummikub/client

React SPA frontend — thin UI layer that displays game state and sends player actions to the server via Socket.IO. No authoritative game logic (shared validation helpers used only for pre-validation/display). React 19 + React Router 7 + Tailwind v4 (Vite plugin) + Socket.IO client.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/App.tsx` | Root component — global state, Socket.IO listeners, routing (`/`, `/lobby/:gameCode`, `/game/:gameCode`, `/game-over`) + `GameBoardWrapper` (reconnect fallback, full-game → spectator offer, AI error banner) |
| `src/socket.ts` | Singleton Socket.IO client (notes `VITE_SERVER_URL`, default `http://localhost:3000`), `autoConnect: false` |
| `src/main.tsx` | React bootstrap (`StrictMode`) |
| `src/contexts/GameContext.tsx` | React context: `gameState`, `playerId`, `gameCode`, `error`, `isSpectator`, `spectatorState`, `lobbyPlayers`, `aiModels`, `aiError` + `useGame()` |
| `src/contexts/AiDebugContext.tsx` | AI debug console state: transcripts/racks per player + round, socket-driven store (`applyDebugEvent`, `applyDebugHistory`), `openConsole`/`closeConsole`/`requestHistory`, `useAiDebug()` |
| `src/pages/Home.tsx` | Landing page — name input, create a game |
| `src/pages/Lobby.tsx` | Waiting room — share game code/URL, join flow, player count vs `MAX_PLAYERS`, add/remove AI players (model select) |
| `src/pages/GameBoard.tsx` | Main player view — tile selection, staging copies (`workingBoard`/`workingRack`), turn actions (`turn:play`, `turn:end`, `turn:draw`, `turn:pass`), client-side pre-validation, joker retrieval rules |
| `src/pages/SpectateBoard.tsx` | Read-only spectator view — player cards, board, pool, pass-count banner, AI debug console access; emits nothing |
| `src/pages/GameOver.tsx` | End screen — scores, games won, Play Again (`game:playAgain`), Back to Home |
| `src/components/GameBoard.tsx` | Presentational: `TileComponent`, `TileSetComponent` (joker display + validation errors), `Board`, `Rack`, `Pool`, `OpponentInfo` (debug-clickable for AI), `Controls` |
| `src/components/TileSvg.tsx` | Inline SVG tile face (`TileSvg`), joker face, per-color text colors |
| `src/components/AiDebugConsole.tsx` | Floating AI debug panel — transcript items (`prompt`/`thinking`/`tool_call`/`response`), mini rack strip, auto-scroll + history request |

## Data flow

- App registers all Socket.IO listeners once and pushes state down through contexts; pages/components are mostly stateless consumers
- `GameBoard.tsx` (page) stages edits locally and validates with shared helpers (`getBoardValidationErrors`, joker checks) before emitting; server remains authoritative (rejections surface via `move:rejected`/`game:error` and clear after 3s)
- Player identity persists in `localStorage` (`rummikub_playerId`, `rummikub_gameCode`) for reconnection
- Spectator state is discriminated on `state.type === "spectator"`

## Testing

- Co-located `*.test.tsx` vitest tests (e.g. `ai-debug-console.test.tsx`, `ai-ui.test.tsx`, `turn-highlight.test.tsx`); no DOM/testing-library — components rendered with `react-dom/server` `renderToString`
- Contexts injected by passing Provider `value` overrides; router wrapped in `MemoryRouter`
- Full flows covered by Playwright e2e in `packages/qa`

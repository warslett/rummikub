# @rummikub/server

Authoritative game server — manages game state, enforces rules, and communicates real-time updates via Socket.IO.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Entry point — Express + Socket.IO setup, health endpoint, test seeding endpoint, cleanup scheduler |
| `src/game.ts` | Core game state machine: `Game` class with all logic (deal, draw, play, manipulate, undo, pass, scoring, stalemate, joker rules, reconnection) |
| `src/gameManager.ts` | Game lifecycle manager — creates/looks up games by code, cleans up expired games (>24h) |
| `src/handlers.ts` | Socket.IO event handlers — bridges client events to `Game`/`GameManager` methods, broadcasts state updates |
| `src/ai/*` | AI player infrastructure: config, turn controller, scripted/pluggable providers, turn runner, model listing |


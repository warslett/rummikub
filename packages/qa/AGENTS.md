# @rummikub/qa

End-to-end test suite using Playwright — tests the full system (client + server) through browser automation with deterministic game state seeding.

## Key Files

| File | Responsibility |
|------|---------------|
| `tests/helpers.ts` | Shared fixtures and helpers: `createGame`, `joinGame`, `startGame`, `seedGame` (POST `/test/seed`), `SeedState` type |
| `tests/home-page.spec.ts` | Home page UI tests (create/join form validation) |
| `tests/game-flow.spec.ts` | Core flow: create, join, start, draw, turns, pool sync, errors |
| `tests/turn-controls.spec.ts` | Turn actions: end turn, draw, undo, initial meld gating |
| `tests/manipulation.spec.ts` | Board manipulation: extend runs, invalid moves, undo |
| `tests/jokers.spec.ts` | Joker rules: display, retrieval, penalty |
| `tests/stalemate.spec.ts` | Stalemate: consecutive passes, lowest-rack wins |
| `tests/scoring.spec.ts` | Multi-round scoring, games-won tracking |
| `tests/reconnection.spec.ts` | Disconnect/reconnect notifications |
| `playwright.config.ts` | Playwright config: Chromium, single worker, screenshots on failure |


# @rummikub/qa

End-to-end test suite using Playwright — tests the full system (client + server) through browser automation with deterministic game state seeding. Test names reference IDs from `phase1.md` (manual Phase 1 test plan).

## Key Files

| File | Responsibility |
|------|---------------|
| `tests/helpers.ts` | Fixtures + helpers: `createGame`, `joinGame`, `startGame`, `seedGame` (POST `/test/seed`), `addAiPlayer`, `startGameWithAi`, `getRackTileCount`, `getPoolCount`, `createPlayerContext`, `SeedState` type (with optional `aiScripts`), `CLIENT_URL`/`SERVER_URL` from `BASE_URL`/`SERVER_URL` env |
| `tests/home-page.spec.ts` | Home page UI tests (create/join form validation) |
| `tests/game-flow.spec.ts` | Core flow: create, join, invalid codes, join-full-game spectator offer, start (14 tiles each, pool 78), draw, one active turn, pool sync, opponent rack hidden, lobby URL copy, server `/health` |
| `tests/turn-controls.spec.ts` | Turn actions: end turn, draw, undo, initial meld gating, per-set validation highlighting |
| `tests/manipulation.spec.ts` | Board manipulation: extend runs/groups, joker insert, seeded boards, invalid moves with error tooltips, pre-meld gating, undo |
| `tests/jokers.spec.ts` | Joker rules: display (`aria-label="Joker"`), retrieval, freed-joker-same-turn, 30-point penalty |
| `tests/stalemate.spec.ts` | Stalemate: consecutive passes, lowest-rack wins, single pass doesn't end game |
| `tests/scoring.spec.ts` | Multi-round scoring, Play Again, games-won tracking |
| `tests/reconnection.spec.ts` | Disconnect/reconnect via localStorage identity restore, banner handling |
| `tests/multiplayer.spec.ts` | 3/4-player games: pool math, turn rotation, scoring, spectator offer for 5th visitor, 2-player regression |
| `tests/ai-opponent.spec.ts` | AI opponent: add/remove AI in lobby, auto-turns, seeded `aiScripts` wins, provider-failure error banner, AI debug console (transcripts, history, multi-AI switching) |
| `tests/spectator.spec.ts` | Spectator mode: join full game, real-time updates, no rack/actions visible, sees Game Over + Play Again, turn indicator |
| `tests/phase2.spec.ts` | Phase 2 additions: draw-tile flow, seeded 30+ initial meld play |
| `playwright.config.ts` | Chromium only, 1 worker, `fullyParallel: false`, retries on CI, HTML + list reporters, trace on first retry, screenshots on failure. `webServer` is an echo — Playwright does NOT start the stack |

## Running tests

The dev stack must already be running (started via `docker compose -f docker-compose.dev.yml up`). Server must run with `NODE_ENV=test` (enables `/test/seed`), plus `AI_PROVIDER=scripted`, `AI_DEFAULT_MODEL=test-model`, and `AI_DEBUG=true` for the AI debug console tests.

- `npm run test:e2e` (also `test:e2e:ui`, `test:e2e:debug`, `test:e2e:headed`)
- Single test: `npx playwright test -g "TC-01"`; single file: `npx playwright test tests/home-page.spec.ts`
- Report: `npx playwright show-report`
- Env vars: `BASE_URL` (client, default `http://localhost:5173`), `SERVER_URL` (default `http://localhost:3000`)
- First-time setup: `bash packages/qa/setup.sh`

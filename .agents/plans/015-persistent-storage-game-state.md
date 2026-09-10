# Phase 4.5a: Persistent Storage — PostgreSQL + Game State (Plan A of 2)

## Goal

Replace the in-memory-only game store with **write-through persistence to PostgreSQL**, so all game state survives a server restart:

- Every mutating game operation (join, start, draw, play, manipulate, undo, pass, end, Play Again, disconnect/reconnect) persists the full `GameState` snapshot.
- On boot, the server restores all non-expired games from the database; players reconnect via the existing URL + localStorage `playerId` flow (F-25/F-26) and continue mid-turn — racks, board, pool, scores, turn snapshot, turn actions and phase are all intact.
- A PostgreSQL instance is added to the production docker-compose with a named volume; persistence is **on by default** (opt-out by unsetting `DATABASE_URL`).

This plan establishes the storage layer and persists **game state only**. Plan B (016) persists the AI session (conversations, turn tracking, AI errors, debug transcripts) on top of the same layer.

Prerequisites: none beyond the current main branch. Plan B depends on this plan.

## PRD References

- F-25/F-26/F-27 (reconnection) — unchanged behaviour, now restart-proof
- F-33 (24h expiry) — extended: expired games are deleted from the database too
- F-34/F-35 — **rewritten by this plan** (see Documentation section): persistence instead of in-memory-only
- NF-03 (50 concurrent games) — one JSONB upsert per move is well within budget
- NF-04 — unchanged; racks live server-side (in DB now), never sent to other clients

## Scope Decisions

- **Backend: PostgreSQL via `pg` (node-postgres)**, no ORM. One row per game; the full `GameState` is stored as **JSONB**. `phase`, `created_at`, `last_activity_at` are duplicated as queryable columns.
- **On by default**: production `docker-compose.yml` adds a `postgres` service (named volume, healthcheck) and passes `DATABASE_URL`; the server depends on it being healthy.
- **Opt-out = in-memory**: when `DATABASE_URL` is unset, a `NoopGameStore` is used and behaviour is exactly today's (in-memory only). This is the mode for unit tests and DB-less dev; no test today needs to change.
- **Fail fast at boot, degrade at runtime**: if `DATABASE_URL` is set but the DB is unreachable, the server retries a few times then exits with a clear log line. If a save fails while running, the error is logged and gameplay continues in memory (next successful save self-heals); saves never block or crash gameplay.
- **Write-through, not event-sourcing**: persist the serialized `GameState` after every mutation via a persist hook on `Game` (single integration point, so mutations from socket handlers *and* the AI controller are both covered). Async saves are serialized per game code (promise chain) so snapshots cannot be applied out of order.
- **Restore semantics**: restored human players are marked `connected = false` (their sockets died with the old process; `game:reconnect` flips them back). AI players stay `connected = true`. `turnActions`/`turnSnapshot` are restored as-is, so undo still works mid-turn after a restart.
- **Restart simulation for e2e**: a test-only `POST /test/reload` endpoint (`NODE_ENV=test`) unloads all in-memory games and re-loads them from the store — deterministic "restart" inside Playwright without managing server processes. A real `docker compose restart` is covered by manual validation.
- **Expiry**: `cleanupExpiredGames` deletes the DB row (in addition to the in-memory entry); boot also purges rows older than 24h.
- **`seededScripts`** (test-only field inside `GameState`) round-trips harmlessly as part of the JSONB snapshot.
- **Health endpoint** gains a DB probe (`SELECT 1`) so orchestrators/healthchecks can see persistence status.

## Acceptance Criteria

1. With `DATABASE_URL` set, every game mutation persists the full serialized `GameState` to the `games` table (one row per game, updated in place)
2. A server restart does not lose games: after boot, all non-expired games are restored and `game:reconnect` returns the exact pre-restart state (rack, board, pool, scores, turn, phase, round number)
3. Restored mid-turn games keep `turnActions` and `turnSnapshot`; the reconnecting player can still undo within their turn
4. Restored human players appear disconnected until they reconnect; reconnecting notifies the other players (`player:reconnected`) as today
5. Games in `lobby` phase are restored and remain joinable/startable
6. Ended games are restored; Play Again continues with scores/gamesWon intact
7. Games inactive >24h are deleted from memory **and** the database (runtime cleanup and boot purge)
8. With `DATABASE_URL` unset, behaviour is identical to today (in-memory only); all existing tests pass unchanged
9. If the DB is unreachable at boot, the server retries then exits with a clear error; if a write fails at runtime, the error is logged and gameplay continues
10. Saves for the same game are applied in mutation order (no stale snapshot can overwrite a newer one)
11. `/health` reports DB reachability when persistence is enabled

## Edge Cases

- DB unreachable at boot (persistence enabled) → bounded retries, then fail-fast exit with clear log
- Runtime save failure → log + continue; next mutation retries the save (self-heals)
- Out-of-order async writes → per-game serialized write queue (last write wins, in order)
- Game code collision at create (row exists but not in memory, e.g. row created by an old crash after expiry filter) → insert conflict is caught and a new code is generated (the in-memory uniqueness loop already covers restored rows)
- Restored lobby game → join/start work; MAX_PLAYERS enforced from restored state
- Restored ended game → Play Again works, scores/gamesWon carried in snapshot
- All players marked disconnected after restore; AI players always connected — opponent of a never-returning player sees them as disconnected (honest state)
- `disconnect` handler currently mutates `player.connected` directly → refactored into a `Game` method so the persist hook fires
- 24h cleanup while a save for that game is queued → delete supersedes (delete after queued writes drain)
- Postgres restart mid-game → server's pool reconnects transparently; failed saves logged, next save heals
- Concurrency (NF-03): single JSONB upsert per move; PK lookup only — no migration pressure at 50 games
- NF-04: the DB holds racks; only the server process can reach it (compose-internal network); no change to what clients receive
- `/test/seed` mutates state → persist hook fires there too (games stay consistent in tests)

## E2E Tests

Requires: postgres dev container + dev server started with `DATABASE_URL` (see e2e_testing.md change). The `scripted` provider is unaffected (Plan B covers AI session), so existing tests must still pass — they run with persistence on in this setup and must not regress.

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-PS-01 | Mid-game state survives restart | Create 2-human game, seed a mid-game state (several moves played, one player mid-turn with placed tiles), call `POST /test/reload` (simulated restart), reconnect both players via `game:reconnect` | Both clients receive `game:state` identical to pre-reload (rack, board, pool size, scores, current turn, round, hasPlayedThisTurn); board shows the placed sets; opponent appears disconnected until their reconnect event; a mid-turn undo still reverts to the turn snapshot |
| TC-PS-02 | Lobby survives restart | Create game, second player joins (still in lobby), `POST /test/reload`, both players reconnect and start the game | Lobby state shows both players after restore; game starts and deals 14 tiles each; pool has 96 tiles |
| TC-PS-03 | Ended game + scores survive restart | Play a game to completion (seed a one-tile-away state), end it, `POST /test/reload`, reconnect, Play Again | Pre-reload end state (scores, gamesWon) matches post-reload; Play Again starts round 2 with scores carried over |

(Unit/integration tests cover: write-through on every mutation, restore semantics, expiry deletion, no-op mode, boot fail-fast, write ordering — see steps below. Real process restart is a manual validation step.)

## Implementation Steps

### Step 1: Storage config + dependencies

- Add deps to `packages/server`: `pg`, dev deps `@types/pg`, `pg-mem` (in-memory Postgres for unit tests); run `npm install`
- New `packages/server/src/storage/config.ts`:
  - `parseStorageConfig(env)` → `{ databaseUrl: string; enabled: boolean }` (`enabled = databaseUrl.trim().length > 0`)
  - Export singleton `storageConfig` reading `process.env`
- **Tests**: enabled/disabled parsing (empty, whitespace-only, set)

---

### Step 2: DB bootstrap + game store

- New `packages/server/src/storage/db.ts`:
  - Lazy pg `Pool` from `storageConfig.databaseUrl`
  - `ensureSchema()` — `CREATE TABLE IF NOT EXISTS games (game_code TEXT PRIMARY KEY, phase TEXT NOT NULL, state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, last_activity_at TIMESTAMPTZ NOT NULL)`
  - `dbHealth()` — `SELECT 1`
  - `closeDb()`
- New `packages/server/src/storage/gameStore.ts`:
  - `GameStore` interface: `upsertGame(state: GameState)`, `loadAllGames(): Promise<GameState[]>`, `deleteGame(code: string): Promise<void>`, `deleteExpiredGames(cutoffMs: number): Promise<string[]>`, `close()`
  - `PostgresGameStore` — implements the interface with parameterized SQL (JSONB round-trip via `JSON.stringify`/`::jsonb`); `deleteExpiredGames` uses the `last_activity_at` column and returns deleted codes
  - `NoopGameStore` — all methods no-op/return empty
  - `createGameStore(config?)` factory
- **Tests** (`gameStore.test.ts`, pg-mem via its pg adapter): upsert inserts then updates; `loadAllGames` round-trips a realistic `GameState` losslessly (racks, pool order, turnSnapshot, seededScripts); delete; expiry window boundary; Noop store behaviour

---

### Step 3: Persist hook + restore on `Game`

- `packages/server/src/game.ts`:
  - `onPersist(cb: (state: GameState) => void)` — stores a single callback (GameManager sets it)
  - Every mutating public method calls the hook at the end: `addPlayer`, `addAiPlayer`, `removeAiPlayer`, `start`, `drawTile`, `playSets`, `manipulateBoard`, `undoTurn`, `endTurn`, `passTurn`, `applyScores`, `startNewRound`, `reconnectPlayer`, `seedGame`, and new `setPlayerConnected(playerId, connected)`
  - `restoreState(state: GameState)` — deep-clones the snapshot into `this.state` and forces `connected = false` for all non-AI players
  - Extract a private `notifyPersist()` (no-op when no callback)
- `packages/server/src/handlers.ts`: disconnect handler uses `game.setPlayerConnected(...)` instead of mutating the player object
- **Tests**: hook fires once per mutation with the post-mutation state; hook not set → no-op; `restoreState` round-trip (`getState`/`getPlayerState` equal pre/post for a mid-turn state incl. snapshot + actions); restore marks humans disconnected, AI connected; `setPlayerConnected` fires the hook

---

### Step 4: GameManager integration

- `packages/server/src/gameManager.ts`:
  - `setStore(store: GameStore)` (default `createGameStore()`)
  - `createGame()` — registers the persist hook wired to a **per-game write queue**: `queuePersist(code, () => store.upsertGame(serialize(state)))` (promise chain per code so saves apply in order; failures logged, chain continues)
  - `cleanupExpiredGames()` — for each expired game also enqueue `store.deleteGame(code)`; return removed count (unchanged signature)
  - New `restoreGames(): Promise<number>` — `loadAllGames()`, delete expired rows via `deleteExpiredGames(cutoff)`, instantiate `Game` per row (`restoreState` + persist hook + map insert), return count
  - New `unloadAllGames()` — clear the in-memory map (used by the test reload endpoint; AI maps are Plan B's concern)
- `packages/server/src/storage/serialize.ts` — `serializeGameState(state): GameState` (JSON deep clone)
- **Tests**: create → hook persists via fake store; cleanup deletes from store and memory; `restoreGames` rebuilds the map, skips+deletes expired, restores phase/players; `unloadAllGames` empties the map; write queue ordering (two rapid upserts → applied in order)

---

### Step 5: Server startup wiring + reconnect trigger

- `packages/server/src/index.ts`:
  - Before `listen`: build store; if enabled → `ensureSchema()` with bounded retries (e.g. 5 × 2s), then `await manager.restoreGames()` and log restored count; on retry exhaustion exit(1) with a clear message
  - `/health` → `{ status: "ok", db: boolean }` (db probe only when persistence enabled; `db: false` never fails the endpoint)
  - Test-only `POST /test/reload` (NODE_ENV=test): `manager.unloadAllGames(); await manager.restoreGames();` → `{ ok: true, restored }`
- `packages/server/src/handlers.ts`: `game:reconnect` calls `maybeRunNextTurn(io, game, gameCode)` after broadcasting state (harmless when it's a human's turn; resumes a pending AI turn after restart)
- **Tests**: boot happy path restores games; ensureSchema failure exits after retries (fake timers); `/test/reload` re-creates games from the store; reconnect triggers the runner (spy) only via existing gating

---

### Step 6: Docker + env plumbing

- `docker-compose.yml`:
  - `postgres` service (`postgres:16-alpine`, `POSTGRES_USER/PASSWORD/DB=rummikub`, named volume `pgdata`, `pg_isready` healthcheck)
  - `server`: `DATABASE_URL=${DATABASE_URL:-postgres://rummikub:rummikub@postgres:5432/rummikub}`, `depends_on: postgres (service_healthy)`
- `docker-compose.dev.yml`: add `postgres` service under profile `e2e` (ports `5432:5432`, password `postgres`, db `rummikub`) so the e2e dev server can be pointed at it
- `.env.dist`: document `DATABASE_URL` (default for prod compose; unset ⇒ in-memory)
- No Dockerfile changes (`pg` is a normal npm dependency)
- **Tests**: none (config files) — covered by manual validation

---

### Step 7: E2E tests + docs

- `packages/qa/tests/persistence.spec.ts`: TC-PS-01..03 (helpers: create/join/reconnect already exist; add `reloadServer()` helper calling `POST /test/reload`)
- `docs/e2e_testing.md`: start postgres dev container (`docker compose -f docker-compose.dev.yml --profile e2e up -d postgres`) and add `-e DATABASE_URL=postgres://postgres:postgres@postgres:5432/rummikub` to the dev-server command; document `/test/reload`
- `docs/unit_testing.md`: note that storage tests use pg-mem (no external DB needed)
- `docs/prd.md`:
  - Rewrite **F-34**: "Game state is persisted to PostgreSQL on every change (write-through)" and **F-35**: "Games survive server restarts; players reconnect via the game URL and continue where they left off"
  - Add §3.10 "Persistent storage" rows: F-53 (full game state incl. racks/scores/turn snapshot persists), F-54 (24h expiry deletes persisted games), F-55 (AI conversation/session, turn tracking, AI errors and debug transcripts survive restarts — delivered by Plan B), F-56 (persistence enabled by default via `DATABASE_URL`; unset ⇒ in-memory)
  - §5.1 stack table: add PostgreSQL row; §5.4 structure: add `packages/server/src/storage/`
  - §5.6 decision 5 rewrite ("No database" → write-through persistence to Postgres, in-memory Map remains the working cache)
  - §7 Future Considerations: remove "Persistent storage (database)"
- `docs/entities.md`: GameManager row (now persisted via GameStore); new **GameStore** entity row (PostgresGameStore/NoopGameStore, schema, lifecycle: write-through per mutation, restore on boot, cascade delete on expiry) + relationship GameManager → GameStore
- `docs/coding.md`: remove the pitfall "Do not persist game state to disk — MVP uses in-memory storage only"; add architecture rules: persistence lives in `packages/server/src/storage/`; `Game`/game logic never issues SQL; persistence failures never break gameplay (log + continue); boot fails fast when the configured DB is unreachable
- `README.md`: env var table (`DATABASE_URL`), docker-compose postgres notes, backup/restore recipe (`docker compose exec postgres pg_dump/pg_restore`), "games survive restarts" blurb
- `docs/docker.md`: postgres service + volume + backup recipe

## Affected Files

| File | Change |
|------|--------|
| `packages/server/package.json` | `pg`, `@types/pg` (dev), `pg-mem` (dev) |
| `packages/server/src/storage/config.ts` | New — `DATABASE_URL` config |
| `packages/server/src/storage/config.test.ts` | New |
| `packages/server/src/storage/db.ts` | New — pool, schema, health |
| `packages/server/src/storage/gameStore.ts` | New — interface, Postgres/Noop impls, factory |
| `packages/server/src/storage/gameStore.test.ts` | New (pg-mem) |
| `packages/server/src/storage/serialize.ts` | New — GameState serialization |
| `packages/server/src/game.ts` | Persist hook, `restoreState`, `setPlayerConnected` |
| `packages/server/src/game.test.ts` | Hook/restore tests |
| `packages/server/src/gameManager.ts` | Store wiring, write queue, restore/unload, expiry deletion |
| `packages/server/src/gameManager.test.ts` | Integration tests (fake store) |
| `packages/server/src/handlers.ts` | `setPlayerConnected` in disconnect; `maybeRunNextTurn` on reconnect |
| `packages/server/src/handlers.test.ts` | Reconnect-trigger + disconnect-persist tests |
| `packages/server/src/index.ts` | Boot: ensureSchema + restore + fail-fast; `/health` db probe; `/test/reload` |
| `docker-compose.yml` | postgres service, volume, `DATABASE_URL`, depends_on healthy |
| `docker-compose.dev.yml` | postgres service (profile `e2e`) |
| `.env.dist` | `DATABASE_URL` |
| `packages/qa/tests/persistence.spec.ts` | New — TC-PS-01..03 |
| `packages/qa/tests/helpers.ts` | `reloadServer()` helper |
| `docs/prd.md`, `docs/entities.md`, `docs/coding.md`, `docs/docker.md`, `docs/e2e_testing.md`, `docs/unit_testing.md`, `README.md` | As above |

## Validation Steps

1. **Automated**: unit/integration tests (`npm test`), typecheck, lint; e2e suite with dev server + postgres (per e2e_testing.md)
2. **Manual (real restart)**:
   - `docker compose up` → create a 2-player game, play several moves, mid-turn leave tiles placed
   - `docker compose restart server` → revisit the game URL in both browsers: full state (racks, board, pool, scores, whose turn) is intact; undo still works mid-turn; opponent appears disconnected until their page reconnects
   - Leave a game idle >24h (or temporarily lower the timeout in a scratch build) → row removed from `games`
   - Backup/restore: `docker compose exec postgres pg_dump -U rummikub rummikub > backup.sql`; wipe volume; restore → games return
   - Unset `DATABASE_URL` → server runs exactly as today (in-memory)
   - Stop postgres, start server with `DATABASE_URL` set → retries then exits with clear error

## See Also

Plan B (`.agents/plans/016-persistent-storage-ai-session.md`) — AI session persistence on top of this layer.

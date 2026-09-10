# Phase 4.5b: Persistent Storage — AI Session (Plan B of 2)

## Goal

Extend the storage layer from Plan A (015) so the **entire AI player session survives a server restart**:

- **LLM conversations** (`llm.ts` in-memory map, keyed `gameCode:roundNumber:playerId`) — the AI keeps its memory of prior turns, turn-start notes and tool exchanges after a restart; the stable `x-opencode-session` header (derived from the same key) is unchanged
- **AI turn tracking** (`runner.ts` `turnTracking`: turn numbers, event baselines/observations) — turn numbering and "observable events" notes continue without reset
- **AI error state** (`runner.ts` `aiErrors`) — a game paused by an AI failure stays paused after a restart and does not re-run the failed AI turn
- **AI debug transcripts** (`debug.ts`, only when `AI_DEBUG=true`) — the debug console history survives restarts
- **Pending AI turns resume after restart**: a restored game whose current player is AI continues its turn automatically at boot (and when a client reconnects — wired in Plan A)

With both plans, PRD Phase 4 "Persistent storage" is delivered: games and AI sessions behave identically across restarts as if nothing happened.

Prerequisites: Plan A (015) — storage config, `db.ts`, `ensureSchema`, PostgresGameStore/NoopGameStore, GameManager store wiring, boot restore, `/test/reload` endpoint.

## PRD References

- F-41/F-42 (AI opponents) — unchanged behaviour, now restart-proof
- F-43 (AI debug console) — transcript history now survives restarts
- F-44 (AI failures pause the game) — pause state survives restarts
- 3.9.1 "Persistent conversation" bullet — now also persisted across server restarts
- F-55 (added by Plan A) — "AI conversation/session, turn tracking, AI errors and debug transcripts survive restarts" — **delivered by this plan**
- NF-04 — unchanged; conversations/transcripts are server-side only

## Scope Decisions

- **Same storage layer, same lifecycle**: four new tables in `ensureSchema` (Plan A's `db.ts`), all with `REFERENCES games(game_code) ON DELETE CASCADE` — deleting an expired game row automatically deletes its AI records, matching the existing `purgeGame` semantics
- **Write-through with pragmatic sync points** (the in-memory maps remain the working stores; DB is a mirror):
  - **Conversations**: persisted when a conversation is created, when compaction replaces it, and once at the end of every `takeTurn` (success **or** error, via `try/finally`). A crash mid-turn loses at most the current partial exchange — identical exposure to today's in-memory behaviour; the next turn-start message re-syncs the model
  - **Turn tracking**: persisted after each turn number update; **AI errors**: persisted on set/delete; **Transcripts**: persisted per recorded item (only when `AI_DEBUG=true`, low volume)
- **Load at boot, not lazily**: `restoreAiState()` fills the in-memory maps from the DB during startup (before the server accepts traffic), keeping the existing module-level maps and all call sites unchanged
- **Failure policy mirrors Plan A**: DB write failures are logged, never break an AI turn; DB unreachable at boot is Plan A's fail-fast (this plan reuses it — AI tables are created in the same `ensureSchema`)
- **No new env vars**: everything is governed by `DATABASE_URL` (Plan A) and `AI_DEBUG` (existing)
- **Scripted provider**: has no conversation; only transcripts (if debug) and turn tracking apply — persistence is provider-agnostic
- **`ai:error` re-emission on reconnect is out of scope**: the persisted error keeps the game paused server-side; a reconnecting client sees the paused game (no stuck banner until the next event). Documented as a known limitation
- **Play Again**: `resetConversations`/`resetTranscripts`/`resetTurnContext`/`resetAiErrors` additionally delete the corresponding DB rows for older rounds (game row deletion on expiry remains cascade-based)
- **`malformedStreak`/`correctiveSent`** (per-turn locals) are not persisted — they reset naturally per turn

## Acceptance Criteria

1. With `DATABASE_URL` set, each AI conversation is persisted (create, post-compaction, end of every turn — success or error) and restored at boot
2. After a restart, an AI player's next turn continues the same conversation: the model still sees the system prompt and all prior exchanges; turn-start messages continue with the **previous turn number** (no reset to 1); the `x-opencode-session` header value is unchanged
3. Compaction results are persisted (a compacted conversation is what survives a restart)
4. Turn tracking (turn numbers, baselines, observations) persists; event notes after a restart reference the correct pre-restart observations
5. A game paused by an AI error (`ai:error`) stays paused after a restart: the failed AI turn is not re-run
6. When `AI_DEBUG=true`, debug transcripts persist per item and are restored at boot; the debug console shows the full round history after a restart
7. When `DATABASE_URL` is unset, behaviour is exactly today's (in-memory only); all existing tests pass unchanged
8. Play Again deletes older-round conversation/transcript rows and turn-tracking/error rows from the DB (and resets in-memory maps as today)
9. Expired games cascade-delete their AI rows (`ON DELETE CASCADE`); the explicit `purgeGame` in-memory purges remain
10. After boot restore, a restored game whose current player is AI resumes its turn automatically (and `game:reconnect` on any client also triggers it)

## Edge Cases

- Crash/error mid-AI-turn → conversation saved via `try/finally` including the partial tool exchange; after restart the resumed turn re-issues a turn-start message on top (model recovers via turn protocol; board state is authoritative)
- Same turn twice after crash (tracking already incremented) → turn number continuity preserved, no duplicate observations (last observation write wins)
- AI_DEBUG toggled off between restarts → transcripts restored only when debug on; conversation/tracking persistence is independent of `AI_DEBUG`
- Two AI players in one game → independent conversation rows (existing key includes playerId)
- Play Again race (old-round row write after reset) → reset deletes rows for rounds < current; a stale write targets a key the game no longer reads; harmless
- Game expiry → cascade deletes AI rows even if `purgeGame` DB calls are skipped (belt-and-braces: keep explicit deletes too)
- LLM error mid-turn after some tool calls → conversation persisted in error state (matches "save at end of takeTurn even on throw"); paused game survives restart via aiErrors row
- Postgres restart mid-AI-turn → failed conversation save logged; next turn's save heals; the in-memory conversation is unaffected
- Boot restore ordering: AI state must be restored before any `maybeRunNextTurn` boot sweep runs (order enforced in index.ts step)
- `/test/reload` must also unload/restore AI in-memory state, otherwise e2e would see stale conversations (extended in Step 7)

## E2E Tests

Same dev-server setup as Plan A (postgres + `DATABASE_URL`). Uses the `scripted` provider for determinism plus `AI_DEBUG=true` so the persisted transcript is observable; conversation continuity is asserted via the persisted transcript (Prompt/Tool call items) and turn-number notes in the transcript text.

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-AI-15 | AI session survives restart | Start human+AI (scripted) game, let the AI take 2+ turns, `POST /test/reload` (simulated restart), reconnect the human, let the AI take another turn, open the AI debug console | Console history contains items from **all** turns including pre-reload ones (system prompt first, ordered); the latest turn-start Prompt item references a turn number greater than 1 (numbering continued); the AI takes its turn normally after reconnect |
| TC-AI-16 | Paused AI error survives restart | Seed a scripted AI with a `fail` script action → AI turn errors → `ai:error` and game paused; `POST /test/reload`; reconnect the human | Game remains paused: no new AI turn runs after reload (board unchanged, no new `ai:debug`/`ai:error` storm); human's own UI still functions; ending the human turn does not trigger the broken AI again |

(Unit tests cover: conversation save points incl. error path and compaction; tracking/error persistence; boot restore into maps; cascade delete on expiry; Play Again row deletion; transcript gating by `AI_DEBUG`.)

## Implementation Steps

### Step 1: AI store (schema + CRUD)

- `packages/server/src/storage/db.ts`: extend `ensureSchema()` with (all FK `REFERENCES games(game_code) ON DELETE CASCADE`):
  - `ai_conversations (game_code, round_number, player_id, messages JSONB, PK(game_code, round_number, player_id))`
  - `ai_turn_tracking (game_code PK, data JSONB)`
  - `ai_errors (game_code, player_id, message TEXT, PK(game_code, player_id))`
  - `ai_debug_transcripts (game_code, round_number, player_id, items JSONB, PK(game_code, round_number, player_id))`
- New `packages/server/src/storage/aiStore.ts`:
  - `AiStore` interface + `PostgresAiStore`/`NoopAiStore` + `createAiStore()` factory, wired off the same `storageConfig`
  - Conversations: `upsertConversation(key, messages)`, `loadAllConversations(): Promise<{key, messages}[]>`, `deleteConversationsBeforeRound(gameCode, round)`, `deleteGameConversations(code)`
  - Turn tracking: `upsertTurnTracking(gameCode, data)`, `loadAllTurnTracking()`, `deleteTurnTracking(gameCode)`
  - Errors: `upsertAiError(gameCode, playerId, message)`, `loadAllAiErrors()`, `deleteAiError(gameCode, playerId)`, `deleteGameAiErrors(gameCode)`
  - Transcripts: `upsertTranscript(key, items)`, `loadAllTranscripts()`, `deleteTranscriptsBeforeRound(gameCode, round)`, `deleteGameTranscripts(code)`
- **Tests** (`aiStore.test.ts`, pg-mem): round-trips for all four record types; cascade delete via parent game row; before-round deletions; Noop impl

---

### Step 2: Conversation persistence in LlmProvider

- `packages/server/src/ai/providers/llm.ts`:
  - Module-level `aiStore` (set once via `setAiStore()` from index.ts; default Noop)
  - Persist on conversation creation and after compaction (at the `conversations.set` sites)
  - Wrap the `takeTurn` loop body in `try/finally` → persist the conversation once at exit (success, thrown error, or iteration cap)
- `packages/server/src/gameManager.ts` (or index.ts boot): `setAiStore(createAiStore())` alongside the game store
- **Tests** (`llm.test.ts`): fake store — conversation persisted at creation; after each completed turn (success and thrown-error paths) the saved messages match the in-memory map; post-compaction save; unset store → no-op; existing conversation-lifecycle tests still pass

---

### Step 3: Turn tracking + AI errors persistence in runner

- `packages/server/src/ai/runner.ts`:
  - Persist `turnTracking` (Map→plain object serialization: `{ roundNumber, turnNumber, baseline, observations }`) after each update; delete row in `resetTurnContext`
  - Persist `aiErrors` on set; delete on `resetAiErrors`; delete game rows in a new `purgeAiState(gameCode)` (game expiry helper)
  - New `restoreAiState(): Promise<void>` — loads tracking + errors into the module maps
  - New `unloadAiState()` — clears maps (for `/test/reload`)
- `packages/server/src/gameManager.ts`: expiry cleanup calls `purgeAiState(code)` (next to `purgeGame`/`purgeDebugTranscripts`)
- **Tests** (`runner.test.ts`): tracking persisted per turn and restored (turn numbers continue); error set/clear persisted; reset functions delete rows; expiry purge; no-op store

---

### Step 4: Debug transcript persistence

- `packages/server/src/ai/debug.ts`:
  - Persist the full item array for the key in `recordDebugItem` (only when `aiConfig.debug`)
  - `resetTranscripts`/`purgeGame` also delete DB rows; new `restoreTranscripts()` loads items back into the map (only when debug on); `unloadTranscripts()` clears the map
- **Tests** (`debug.test.ts`): items persisted when debug on; nothing persisted when off; reset/purge delete rows; restore repopulates the map

---

### Step 5: Boot restore + pending-turn resume

- `packages/server/src/index.ts` (after Plan A's `restoreGames()`, before `listen`):
  - `await restoreAiState()` (tracking + errors), `await restoreTranscripts()`, `await restoreConversations()` (fills `llm.ts` map)
  - Boot sweep: for each restored game with `phase === "playing"` and an AI current player, fire-and-forget `maybeRunNextTurn(io, game, code)` (respects persisted `aiErrors`; busy-set prevents overlap; no-op for human turns)
- Order dependency: AI restore must complete before the sweep (single awaited sequence)
- **Tests** (`index`-level integration in `handlers.test.ts` style or a new `boot.test.ts`): restored game with AI to move triggers the runner once; persisted aiError prevents re-run; human-turn game does not trigger

---

### Step 6: Play Again + expiry lifecycle wiring

- `packages/server/src/handlers.ts` (`game:playAgain`): after existing resets, delete DB rows: `deleteConversationsBeforeRound`, `deleteTranscriptsBeforeRound`, `deleteTurnTracking`, `deleteGameAiErrors` (wrapped in the same fire-and-forget style; no-op store unaffected)
- `packages/server/src/gameManager.ts`: expiry already cascades (Step 1) + explicit `purgeGame` DB deletes (belt-and-braces)
- **Tests** (`handlers.test.ts`): Play Again deletes older-round rows via fake store; existing reset assertions unchanged

---

### Step 7: `/test/reload` extension + e2e + docs

- `packages/server/src/index.ts`: `POST /test/reload` now also `unloadAiState()` + `unloadTranscripts()` + clear conversations, then re-restore from the store (full restart simulation)
- `packages/qa/tests/ai-persistence.spec.ts`: TC-AI-15, TC-AI-16 (per tables above; dev server already runs with `AI_DEBUG=true` per e2e_testing.md)
- `docs/prd.md`:
  - 3.9.1 "Persistent conversation" bullet: add "…and is persisted, so it survives server restarts (as do turn tracking, AI error/pause state and debug transcripts)"
  - F-44 note: paused state survives restarts
  - Phase 4 checklist: mark **Persistent storage** done (both plans delivered)
- `docs/entities.md`: GameStore row extended (AI tables); LlmProvider + AiDebugTranscript rows: lifecycle now "persisted, restored on boot"; AiTurnRunner row: tracking/errors persisted
- `README.md`: AI section — restarts no longer lose conversations; "What pausing looks like" bullet updated (restart recovers the loop but a persisted AI error keeps the game paused; restart + Play Again is the recovery path); backup note covers AI sessions
- `docs/e2e_testing.md`: no change beyond Plan A's postgres setup (already covers TC-AI-15/16)

## Affected Files

| File | Change |
|------|--------|
| `packages/server/src/storage/db.ts` | Four AI tables in `ensureSchema` |
| `packages/server/src/storage/aiStore.ts` | New — AiStore interface + Postgres/Noop impls |
| `packages/server/src/storage/aiStore.test.ts` | New (pg-mem) |
| `packages/server/src/ai/providers/llm.ts` | `setAiStore`, save at create/compaction/turn-end (try/finally), restore |
| `packages/server/src/ai/providers/llm.test.ts` | Persistence-point tests |
| `packages/server/src/ai/runner.ts` | Tracking + errors persistence, `restoreAiState`/`unloadAiState`/`purgeAiState` |
| `packages/server/src/ai/runner.test.ts` | Persistence tests |
| `packages/server/src/ai/debug.ts` | Transcript upsert/restore/reset/purge |
| `packages/server/src/ai/debug.test.ts` | Persistence tests |
| `packages/server/src/gameManager.ts` | `setAiStore`, `purgeAiState` in expiry cleanup |
| `packages/server/src/gameManager.test.ts` | Expiry cascade/purge assertions |
| `packages/server/src/handlers.ts` | Play Again DB row deletion |
| `packages/server/src/handlers.test.ts` | Play Again persistence tests |
| `packages/server/src/index.ts` | AI restore + boot sweep; `/test/reload` extension |
| `packages/qa/tests/ai-persistence.spec.ts` | New — TC-AI-15, TC-AI-16 |
| `docs/prd.md`, `docs/entities.md`, `README.md` | As above |

## Validation Steps

1. **Automated**: unit/integration tests, typecheck, lint; full e2e suite (dev server with postgres + `DATABASE_URL`, scripted provider, `AI_DEBUG=true`)
2. **Manual (real restart, real model)**:
   - `docker compose up` with `AI_PROVIDER=llm`; play several turns against the AI
   - `docker compose restart server`; revisit the URL: with `AI_DEBUG=true`, open the console — full transcript (system prompt onward) is present; the AI's next turn continues with correct turn numbering and prior-turn memory (it references earlier plays)
   - Force an AI error (e.g. invalid `AI_BASE_URL`): game pauses; restart; game remains paused (no re-run storm); Play Again recovers
   - `docker compose down && docker compose up` (volume intact) → games + AI sessions return
   - Unset `DATABASE_URL` → today's behaviour (AI sessions in-memory only)

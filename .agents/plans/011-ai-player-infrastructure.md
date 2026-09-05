# Phase 4.1: AI Player Infrastructure

## Goal

Add AI players to the game as first-class players. A player in the lobby can add up to `MAX_PLAYERS - 1` AI opponents (each with a chosen model name), remove them, and start a game containing AI players. When it is an AI player's turn, a server-side **AI turn runner** invokes a pluggable **AI provider** through the exact same authoritative `Game` methods a human's socket events use (`playSets`, `manipulateBoard`, `drawTile`, `undoTurn`, `endTurnWithBoard`, `passTurn`). A deterministic **scripted provider** makes AI turns testable without network access. If the provider errors, the AI is paused and all clients are shown the error (game halts until server restart — no auto-recovery, by design).

This plan delivers the infrastructure, scripted provider, lobby UI, and observability hooks. The LLM provider that actually calls a model is **Plan 012** (`.agents/plans/012-ai-llm-agent.md`). Robustness (retries, iteration caps, compaction) is **Plan 013**.

## PRD References

- F-41 (new): Players can add up to `MAX_PLAYERS - 1` AI opponents in the lobby, each configured with a model name
- F-42 (new): AI opponents take turns server-side through the same authoritative game API as human players; AI behaviour is configured via environment variables (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`)
- F-44 (new): AI failures pause the game and surface the error to all players
- NF-04: AI players must never see other players' racks (AI uses `getPlayerState` for itself only — same visibility as a human)
- NF-05: All game logic runs server-side; the AI provider is just another client of the `Game` class

## Scope Decisions

- **Creator must play**: the game creator is always a human player (existing create flow unchanged). AI players fill additional slots (max 4 total players as today).
- **AI is a normal player**: AI players appear in the lobby, in opponents' lists, in scoring, in Play Again rounds. No special-casing in game rules.
- **AI player identity**: auto-generated name `AI: <model>`; `Player.isAI` + `Player.model` fields added. AI players always show as `connected: true` (they have no socket; the disconnect handler ignores them naturally).
- **Provider abstraction**: `AiProvider` interface with a single `takeTurn(controller)` method. `ScriptedProvider` is the only implementation in this plan; the factory (`AI_PROVIDER` env, default `scripted`) returns it. Plan 012 adds `llm`.
- **AiTurnController**: wraps the `Game` instance + Socket.IO emissions. Never throws — every method returns `{ ok: true, state }` or `{ ok: false, error }` so providers (and later the LLM tool loop) get rejection feedback instead of exceptions. Emissions reuse the same helpers as handlers (extracted in Step 2).
- **Pause-and-surface**: if a provider throws/rejects, the runner records an error for that AI, emits `ai:error` to the room, and does not re-trigger that player's turn. There is no intervention mechanism — restart the server (state is in-memory, game is lost; acceptable for MVP).
- **Model list**: server fetches `${AI_BASE_URL}/models` (OpenAI-compatible) when a client requests `ai:getModels`, cached in memory, falling back to `[AI_DEFAULT_MODEL]` on any error (missing key, endpoint down). The lobby dropdown uses this list.
- **Scripted provider behaviour**: if a script (queue of controller actions) is seeded for the player (test mode only), execute it in order; otherwise **draw a tile every turn** — deterministic and valid in every situation.
- **No turn time limit**: R-40 (1-minute limit) remains unimplemented. An AI turn takes as long as its provider takes.

## Acceptance Criteria

1. A player in the lobby can add an AI player with a model chosen from a dropdown (default `AI_DEFAULT_MODEL`), up to `MAX_PLAYERS - 1` AI players / 4 total players
2. AI players can be removed from the lobby before the game starts
3. A game with human + AI (or human + human + AI, etc.) can be started and played to completion
4. When the current turn passes to an AI player, the server automatically runs the AI's turn; the human sees updated board/rack/pool via normal `game:state` broadcasts
5. AI turns go through the same validation as human turns — invalid scripted moves are rejected and returned to the provider as errors
6. If the AI provider fails, all clients receive `ai:error` with the player name and message, and the game stops advancing
7. AI players are visually distinguished (badge with model name) in the lobby and in the opponents list on the game board
8. All existing human-only functionality is unchanged (2-4 human players, spectate, reconnect, Play Again)
9. Play Again works with AI players: new round starts, AI takes turns again in the new round

## Edge Cases

- Game starts with AI as first player → AI turn must trigger immediately after `game:start`
- Turn passes from one AI player directly to another AI player (e.g. human + 2 AI, human ends turn) → chained AI turns must work
- AI added, then a human joins and fills the last slot → "Add AI Player" is disabled when 4 players are present
- `ai:remove` for a human player → rejected (only AI players, only in `lobby` phase)
- `AI_API_KEY`/`AI_BASE_URL` unset or gateway unreachable → model list falls back to `[AI_DEFAULT_MODEL]`; no crash at startup
- AI provider errors mid-turn after partial moves (e.g. played sets but never ended turn) → pause; board is left in the pre-end-turn state (turn snapshot exists; game simply never advances)
- All humans disconnect while an AI game is running → AI turns continue (state broadcasts reach nobody); on reconnect, humans see current state
- Server restart during an AI game → game is lost (existing in-memory behaviour, F-35)
- `AI_PROVIDER` set to an unknown value → factory falls back to `scripted` and logs a warning

## E2E Tests

All tests run with `AI_PROVIDER=scripted` (add `-e AI_PROVIDER=scripted` to the dev-server command in `docs/e2e_testing.md`).

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-AI-01 | Add AI player in lobby | P1 creates game, clicks "Add AI Player", selects model, confirms | Lobby shows "AI: \<model\>" with AI badge; player count updates; models dropdown defaults to `AI_DEFAULT_MODEL` |
| TC-AI-02 | AI takes its turn | P1 + 1 AI, start game; if AI is first it draws; otherwise P1 draws | When it becomes AI's turn, AI draws automatically and turn returns to a human within a few seconds; human's "Waiting for other players..." clears |
| TC-AI-03 | AI draw decrements pool | Observe pool count before/after AI's draw turn | Pool count decreases by 1 after AI draws; AI rack size increases by 1 |
| TC-AI-04 | Remove AI player before start | P1 adds AI, clicks remove | AI disappears from lobby; player count decreases; game can still be started with humans |
| TC-AI-05 | Add AI blocked when full | 1 human + 3 AI (4 players) | "Add AI Player" is disabled/hidden |
| TC-AI-06 | Mixed 3-player rotation | P1 + P2 + 1 AI start game; P1 and P2 draw | Turn rotation cycles P1 → P2 → AI → P1 correctly; AI auto-draws each time |
| TC-AI-07 | AI badge on game board | Human + AI game in progress | Opponents list shows AI with model badge |
| TC-AI-08 | AI wins the game | Seed AI's rack with exactly a valid 30+ point meld; script AI to `playSets` + `endTurn` | Game ends; AI declared winner; `game:ended` scores shown on GameOver screen |
| TC-AI-09 | Play Again with AI | After TC-AI-08, human clicks Play Again | New round starts; AI present; AI draws on its next turn |

## Implementation Steps

### Step 1: Shared — AI player types and payloads

**Test first, then implement** in `packages/shared/src/types.ts`:

- `Player`: add `isAI?: boolean; model?: string`
- `OpponentInfo`: add `isAI: boolean; model?: string`
- `SpectatorGameState.players` entries: add `isAI: boolean; model?: string`
- `GameLobbyStatePayload`: players become `{ id: string; name: string; isAI: boolean; model?: string }[]`
- New payloads:
  ```typescript
  export interface AiModelsPayload {
    models: string[];
    defaultModel: string;
  }
  export interface AiErrorPayload {
    playerId: string;
    playerName: string;
    message: string;
  }
  ```
- Add `AiScriptAction` type used by test seeding:
  ```typescript
  export type AiScriptAction =
    | { action: "playSets"; sets: TileSet[] }
    | { action: "manipulateBoard"; newBoard: TileSet[] }
    | { action: "drawTile" }
    | { action: "undoTurn" }
    | { action: "endTurn"; newBoard?: TileSet[] }
    | { action: "passTurn" };
  ```
- Export everything from `src/index.ts`

**Tests** (`packages/shared/src/types.test.ts` or typecheck): interfaces compile with new fields.

---

### Step 2: Server — extract emission helpers

`handlers.ts` currently owns `emitPlayerStates` / `emitGameEnded` as module-private functions. The AI runner must emit the same events. Extract without behaviour change:

- New file `packages/server/src/emissions.ts` — move `emitPlayerStates(io, game, gameCode)` and `emitGameEnded(io, game, gameCode, endResult)` there; export both. `handlers.ts` imports them.

**Tests:** existing server tests still pass (pure refactor, no new behaviour).

---

### Step 3: Server — Game class: AI players and state plumbing

**Test first, then implement** in `packages/server/src/game.ts`:

- `addAiPlayer(model: string): Player` — creates a player with `isAI: true`, `model`, `connected: true`, id `ai-<timestamp>-<random>`, name `AI: <model>`; respects `MAX_PLAYERS`; only allowed in `lobby` phase
- `removeAiPlayer(playerId: string): void` — removes a player only if `isAI` and phase is `lobby`
- `getState()` unchanged shape (Player already carries new fields)
- `getPlayerState()` / `getSpectatorState()`: populate `isAI` and `model` on opponents/players
- Extend `SeedState` with `aiScripts?: Record<string, AiScriptAction[]>` and apply in `seedGame` (test-mode only usage, but harmless to hold in state)
- Reconnect: `reconnectPlayer` on an AI player id → throw (AI has no client to reconnect)

**Tests** (`packages/server/src/game.test.ts`):
- `addAiPlayer` adds an AI player with correct name/flags; `addAiPlayer` beyond `MAX_PLAYERS` throws
- `addAiPlayer` after game start (phase `playing`) throws
- `removeAiPlayer` removes AI; removing a human throws; removing during `playing` throws
- `getPlayerState` returns `opponents[].isAI/model` correctly for mixed games
- `reconnectPlayer` rejects AI player ids
- `seedGame` stores `aiScripts`

---

### Step 4: Server — AI module skeleton: config, controller, scripted provider, runner

New directory `packages/server/src/ai/`:

- `config.ts` — reads env: `AI_PROVIDER` (default `"scripted"`), `AI_BASE_URL` (default `"https://opencode.ai/zen/v1"`), `AI_API_KEY` (no default), `AI_DEFAULT_MODEL` (no default; model list falls back to `[""]`… define `AI_DEFAULT_MODEL` default as `"scripted-default"` for this plan). Export a frozen `aiConfig` object.
- `AiTurnController` (`controller.ts`) — constructed with `(io, game, gameCode, playerId)`; methods:
  - `getMyState(): { ok: true; state: PlayerGameState }`
  - `playSets(sets): { ok: true; state } | { ok: false; error }` → `game.playSets` (no emission; turn not advanced)
  - `manipulateBoard(newBoard): ...` → `game.manipulateBoard` (no emission)
  - `undoTurn(): ...` → `game.undoTurn`
  - `drawTile(): ...` → `game.drawTile` + `checkGameEnd` + emissions (turn advances)
  - `endTurn(newBoard?): ...` → `game.endTurnWithBoard` + `checkGameEnd` + emissions (turn advances)
  - `passTurn(): ...` → `game.passTurn`; if phase becomes `ended` with stalemate, mirror the `turn:pass` handler's stalemate emission
  - All methods catch `Game` errors and return `{ ok: false, error: message }` (this mirrors the human `move:rejected` path)
  - After any turn-advancing success, call `aiRunner.maybeRunNextTurn(io, game, gameCode)` (Step 5) so chained AI turns work
- `ScriptedProvider` (`providers/scripted.ts`) — `takeTurn(controller)`:
  - Look up the seeded script queue for this player (from `game.getState().seededScripts` — stored via `seedGame`); execute actions in order via the controller, stopping on the first `{ ok: false }`
  - If a turn-ending action (`drawTile`, `endTurn`, `passTurn`) succeeds, the turn is done
  - If no script: call `controller.drawTile()`
  - If a turn-ending action never succeeded and the queue is exhausted, call `controller.drawTile()` as fallback
- `providerFactory` (`providers/index.ts`) — returns `ScriptedProvider` (log a warning and fall back to scripted for unknown `AI_PROVIDER` values)

**Tests** (new `packages/server/src/ai/` test files, using the real `Game` class and a stub `io`):
- Controller `playSets` with invalid tiles → `{ ok: false, error }` matching the human rejection message; board unchanged
- Controller `endTurn` on a valid board → `emitPlayerStates` called (spy), turn advanced
- Scripted provider with a `playSets` + `endTurn` script moves tiles from rack to board and advances turn
- Scripted provider with invalid script action → stops and falls back to draw (or surfaces error — assert chosen behaviour)
- Scripted provider with empty script → draws
- Provider factory returns scripted for `AI_PROVIDER=scripted` and unknown values

---

### Step 5: Server — AI runner and handler hooks

- `runner.ts` — module-level registry keyed by gameCode:
  - `maybeRunNextTurn(io, game, gameCode)` — if game phase is `playing` and the current player `isAI`, and no run is already in-flight for this game, run the provider asynchronously (guard with a per-game `busy` flag). Multiple concurrent games each run independently.
  - On provider error: record `aiErrors[playerId]`, emit `ai:error` (`AiErrorPayload`) to the room, log the error. Never re-trigger the errored player's turn.
- `handlers.ts` hooks — after every point where the turn can advance or the game starts, call `maybeRunNextTurn`:
  - `game:start` (after `game:started` emissions — AI may be the first player)
  - `turn:draw`, `turn:end`, `turn:pass` (after emissions / game-end handling)
  - `game:playAgain` (new round may start on an AI player)
- `handlers.ts` — new socket events:
  - `ai:add` `{ model }` → `game.addAiPlayer(model)`; broadcast updated `game:lobbyState` to the room; on error emit `move:rejected`
  - `ai:remove` `{ playerId }` → `game.removeAiPlayer(playerId)`; broadcast `game:lobbyState`; on error emit `move:rejected`
  - `ai:getModels` → fetch/cached model list (Step 6) and emit `ai:models` (`AiModelsPayload`) to the requesting socket

**Tests:**
- `maybeRunNextTurn` invokes the provider when the current player is AI; not when human
- Chained AI turns: AI A ends turn → AI B's turn triggers (using two AI players and a fake provider)
- Busy guard: a second `maybeRunNextTurn` while in-flight does not double-run
- Provider error → `ai:error` emitted once; subsequent triggers for that player do nothing
- `ai:add` / `ai:remove` update lobby state and reject invalid use (full lobby, removing a human, non-lobby phase)
- `game:start` with AI first player triggers an AI turn

---

### Step 6: Server — model list endpoint

- `models.ts` in `packages/server/src/ai/`:
  - `getModels(): Promise<{ models: string[]; defaultModel: string }>` — GET `${aiConfig.baseUrl}/models` with `Authorization: Bearer ${aiConfig.apiKey}`; map `data[].id` to a sorted string list; cache for 5 minutes; on ANY error (no key, network, non-200) return `{ models: [aiConfig.defaultModel], defaultModel: aiConfig.defaultModel }`
- Wired into the `ai:getModels` handler (Step 5)

**Tests:** mock `fetch` — success parses model ids and caches; failure/missing key falls back to `[AI_DEFAULT_MODEL]`.

---

### Step 7: Client — lobby Add/Remove AI UI

**Test first, then implement:**

- `packages/client/src/App.tsx`:
  - Update `game:lobbyState` listener for the new payload shape (`players[].isAI`, `model`)
  - Add listeners: `ai:models` (store list), `ai:error` (store error for banner)
- `packages/client/src/pages/Lobby.tsx`:
  - On mount (once joined), emit `ai:getModels`
  - "Add AI Player" button (visible to any joined player) → model `<select>` populated from `ai:models` (default `defaultModel`) → confirm emits `ai:add { model }`
  - Disabled when `players.length >= MAX_PLAYERS`
  - Player list: AI players get a badge (e.g. "🤖" per existing style conventions — use a text badge "AI") and a remove (×) button emitting `ai:remove { playerId }`
- `packages/client/src/components/GameBoard.tsx` (`OpponentInfo`) and `packages/client/src/pages/GameBoard.tsx`:
  - Show "AI · \<model\>" badge for `opponent.isAI`
- `packages/client/src/pages/GameBoard.tsx` + `Controls`:
  - When `ai:error` received, show a persistent banner: "AI player stuck: \<playerName\> — \<message\>. Restart the server to recover."
  - When it is an AI opponent's turn, Controls shows "AI is thinking..." instead of "Waiting for other players..." (informational only)

**Tests** (`packages/client`):
- Lobby renders Add AI button and dropdown with fetched models; disabled when full
- Lobby shows AI badge and remove button for AI players
- GameBoard opponents list shows AI badge
- `ai:error` renders the stuck banner

---

### Step 8: E2E tests

- New file `packages/qa/tests/ai-opponent.spec.ts` implementing TC-AI-01 through TC-AI-09
- Extend `packages/qa/tests/helpers.ts` if useful (e.g. `addAiPlayer(page, model)`)
- TC-AI-08 requires seeding (`/test/seed`): seed AI rack with a minimal winning meld and `aiScripts` for the AI player; assert GameOver screen shows AI as winner
- Update `docs/e2e_testing.md` dev-server command to include `-e AI_PROVIDER=scripted` (and `-e AI_DEFAULT_MODEL=test-model`)

---

### Step 9: Documentation

- `docs/prd.md`:
  - Add F-41, F-42, F-44 to functional requirements (3.9 AI Opponents); update Phase 4 milestone: mark "AI opponent" as in progress with a note that it lands across plans 011/012/013
- `docs/entities.md`:
  - `Player` entity: add "may be an AI player (`isAI`) configured with a model name"
  - New entity rows: **AiProvider** (pluggable turn-taker: scripted or LLM; invoked by the AiTurnRunner through an AiTurnController), **AiTurnController** (server-side facade over the Game class with identical authority to socket handlers; returns errors as values instead of events), **AiTurnRunner** (registry that triggers provider runs when the current player is AI; records AI errors and emits `ai:error`)
  - Relationships: `Game → AiTurnController (1:0..N per AI player)`, `AiTurnRunner → Game (1:N)`
- `README.md`: document `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL` env vars
- `AGENTS.md` server key files: add `src/ai/*`

## Affected Files

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | `Player.isAI/model`, `OpponentInfo.isAI/model`, spectator players, lobby payload shape, `AiModelsPayload`, `AiErrorPayload`, `AiScriptAction` |
| `packages/shared/src/index.ts` | Export new types |
| `packages/server/src/emissions.ts` | New — extracted `emitPlayerStates`/`emitGameEnded` |
| `packages/server/src/handlers.ts` | Import emissions; `ai:add`/`ai:remove`/`ai:getModels` handlers; `maybeRunNextTurn` hooks on start/draw/end/pass/playAgain |
| `packages/server/src/game.ts` | `addAiPlayer`, `removeAiPlayer`, `isAI/model` in player/spectator state, `SeedState.aiScripts`, reject AI reconnect |
| `packages/server/src/game.test.ts` | Tests for all new Game behaviour |
| `packages/server/src/ai/config.ts` | Env config |
| `packages/server/src/ai/controller.ts` | `AiTurnController` |
| `packages/server/src/ai/runner.ts` | `AiTurnRunner` + `maybeRunNextTurn` |
| `packages/server/src/ai/models.ts` | Gateway model list fetch/cache/fallback |
| `packages/server/src/ai/providers/index.ts` | Provider factory |
| `packages/server/src/ai/providers/scripted.ts` | `ScriptedProvider` |
| `packages/server/src/ai/*.test.ts` | Controller/provider/runner/model tests |
| `packages/server/package.json` | (no new deps in this plan) |
| `packages/client/src/App.tsx` | Lobby payload shape, `ai:models`, `ai:error` listeners |
| `packages/client/src/pages/Lobby.tsx` | Add/remove AI UI, model dropdown |
| `packages/client/src/pages/GameBoard.tsx` | AI badge, stuck banner, "AI is thinking..." |
| `packages/client/src/components/GameBoard.tsx` | `OpponentInfo` AI badge; `Controls` text |
| `packages/client/src/pages/SpectateBoard.tsx` | AI badge on spectator player list |
| `packages/qa/tests/ai-opponent.spec.ts` | TC-AI-01..09 |
| `packages/qa/tests/helpers.ts` | AI helpers if needed |
| `docs/prd.md`, `docs/entities.md`, `docs/e2e_testing.md`, `README.md`, `AGENTS.md` | As above |

## Validation Steps

1. **Automated**: unit/integration tests (`npm test`), typecheck, lint, e2e suite pass
2. **Manual (scripted)**: start dev server with `AI_PROVIDER=scripted`; create a game; add 1 AI in the lobby; start; verify the AI auto-draws on its turns and turn rotation is smooth; add a second human via second browser and play a mixed 3-player game; click Play Again after a finished round
3. **Manual (models list)**: with a valid `AI_API_KEY` set, open the Add-AI dropdown and verify real gateway model ids appear; with the key unset, verify the dropdown falls back to the default model

# @rummikub/server

Authoritative game server — manages game state, enforces rules, and communicates real-time updates via Socket.IO. Express 5 + Socket.IO + `openai` SDK.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Entry point — Express + Socket.IO wiring, `GET /health`, test-only `GET /test/game/:code` and `POST /test/seed` routes (gated on `NODE_ENV=test`), cleanup scheduler, `PORT` (default 3000) |
| `src/game.ts` | Core state machine: `Game` class — deal, draw, play sets, board manipulation, undo, turn end, pass/stalemate, scoring, joker retrieval rules, reconnection, `seedGame`/`SeedState`, player/spectator state projections |
| `src/gameManager.ts` | Game lifecycle — `createGame` (random 6-char codes), `getGame`, cleanup of games idle > 24h (also purges AI conversations/transcripts), 10-min `startCleanup` interval |
| `src/handlers.ts` | Socket.IO event handlers — module-level `manager` singleton, maps client events to `Game`/`GameManager`, broadcasts state; also `game:spectate`, `game:reconnect`, `ai:*` events, and test-only `game:seed` |
| `src/emissions.ts` | Broadcast helpers: `emitPlayerStates` (private `game:state` per player, spectator view for spectators), `emitGameEnded`, `emitStalemateEnded` |
| `src/ai/*` | AI opponent infrastructure (see below) |

## Game lifecycle

`Game` phases: `lobby` → `playing` → `ended` (→ `startNewRound` back to `playing`). `getRackValue` counts unplayed jokers at `JOKER_PENALTY` (30). Stalemate: `consecutivePasses` ≥ player count → lowest unique rack value wins. `SeedState` supports pre-defined `aiScripts` keyed by player id.

## Socket.IO events

Inbound: `game:create`, `game:join`, `game:spectate`, `game:start`, `turn:draw`, `turn:play`, `turn:manipulate`, `turn:undo`, `turn:end`, `turn:pass`, `game:playAgain`, `game:reconnect`, `ai:add`, `ai:remove`, `ai:getModels`, `ai:debugHistory`, disconnect (marks player offline, `player:disconnected`).

Outbound: `game:created`, `game:joined`, `game:started`, `game:lobbyState`, `game:state`, `game:error`, `game:full`, `game:ended`, `move:rejected`, `spectator:joined`, `player:reconnected`, `player:disconnected`, `ai:models`, `ai:error`, `ai:debug`, `ai:debugHistory`.

After every state-emitting event, `maybeRunNextTurn` is invoked (auto-plays one or more consecutive AI turns).

## AI infrastructure (`src/ai/`)

Flow: **`runner.ts` → `providers/index.ts` (`getProvider`) → provider drives `controller.ts`** which wraps `Game` mutations and emits state.

| File | Responsibility |
|------|---------------|
| `ai/config.ts` | Frozen `aiConfig` singleton from env vars: `AI_PROVIDER` (default `scripted`), `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`, timeouts/retries (`AI_MAX_RETRIES`, `AI_MAX_TOOL_ITERATIONS`), context limits, `AI_DEBUG` |
| `ai/runner.ts` | `maybeRunNextTurn` scheduler — `busyGames` reentrancy guard, consecutive-AI looping, `TurnContext` derivation (turn number + event notes), error tracking in `aiErrors` + `ai:error` emission |
| `ai/controller.ts` | `AiTurnController` — game-mutating wrappers (`playSets`, `manipulateBoard`, `undoTurn`, `drawTile`, `endTurn`, `passTurn`) returning `ControllerResult`, plus debug item recording |
| `ai/providers/scripted.ts` | `ScriptedProvider` — deterministic: executes seeded `AiScriptAction` scripts, falls back to draw/pass; used for tests |
| `ai/providers/llm.ts` | `LlmProvider` — OpenAI-compatible tool-calling loop with per-player conversation cache, retry via `retry.ts`, context compaction, one corrective nudge, throws on iteration limit |
| `ai/providers/index.ts` | Provider factory; unknown names fall back to scripted with a warning |
| `ai/prompt.ts` | `buildSystemPrompt` (rules + strategy + turn protocol), `buildTurnStartMessage` |
| `ai/tools.ts` | LLM tool-calling layer: 7 tool schemas (`get_game_state`, `play_sets`, `manipulate_board`, `undo_turn`, `draw_tile`, `end_turn`, `pass_turn`), `executeTool` maps tool calls to controller methods |
| `ai/retry.ts` | `classifyError` (transient vs fatal), `withRetries` with exponential backoff + jitter |
| `ai/compaction.ts` | Context-window management — token estimation, summarizing older conversations, fallback note prefix |
| `ai/debug.ts` | In-memory debug transcripts keyed by game/round/player; `ai:debug` event emission; requires `AI_DEBUG=true` |
| `ai/models.ts` | `getModels()` — fetches model list from `AI_BASE_URL` with 5-min cache and fallback |

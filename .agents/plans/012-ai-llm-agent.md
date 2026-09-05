# Phase 4.2: LLM Agent (Tool-Calling via OpenAI-Compatible Gateway)

## Goal

Implement the `llm` AI provider: when it is an AI player's turn, the server runs a **tool-calling agent loop** against an OpenAI-compatible chat completions endpoint (default: the opencode Zen gateway, `https://opencode.ai/zen/v1`). The model receives a system prompt with the Rummikub rules and its private state, and takes its turn by calling tools that map 1:1 to the same `AiTurnController` verbs a human has — including receiving validation errors as tool results so it can retry, exactly like a human clicking around the UI. The agent keeps a **persistent conversation** across turns within a round. Every request, response, tool call, and tool result is logged as JSON lines to the server console (`docker compose logs -f`).

Prerequisites: Plan 011 (`011-ai-player-infrastructure.md`) — `AiProvider`, `AiTurnController`, runner, lobby UI.

Robustness (retries, malformed-call handling, iteration caps, context compaction) is deliberately minimal here and refined in **Plan 013**.

## PRD References

- F-42: AI turns via configurable OpenAI-compatible LLM endpoint (`AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`)
- F-43 (new): The AI's system prompt, conversation history, tool calls/results, and errors are logged to the server console for inspection
- NF-04: The model only ever sees its own rack (controller returns its own `PlayerGameState`; opponents appear as rack sizes)
- R-12 through R-39: all rules already enforced by the `Game` class; the agent receives rejections as tool-result errors

## Scope Decisions

- **SDK**: the `openai` npm package, pointed at `AI_BASE_URL` with `AI_API_KEY`. No OpenAI-specific features beyond chat completions + tools (works with any compatible endpoint, including local ones).
- **Per-player model resolution**: Each AI player created in the lobby has its chosen model stored on `player.model`. When calling completions, `LlmProvider` resolves the model for the active AI player from `game.getState().players` via `controller.getPlayerId()`, falling back to `aiConfig.defaultModel` if unset.
- **Tool set = full human verbs**, mapped to `AiTurnController`:
  | Tool | Controller method | Notes |
  |------|-------------------|-------|
  | `get_game_state` | `getMyState` | Board, own rack, pool size, opponents (names, rack sizes, scores), initial-meld status |
  | `play_sets` | `playSets` | Place one or more new sets from rack (no turn advance). `executeTool` auto-assigns `set.id` if omitted by model |
  | `manipulate_board` | `manipulateBoard` | Submit full new board (no turn advance) |
  | `undo_turn` | `undoTurn` | Revert everything this turn |
  | `draw_tile` | `drawTile` | **Turn-ending** |
  | `end_turn` | `endTurn` | **Turn-ending** (accepts optional `newBoard?: TileSet[]`; validates board; error if invalid or no rack tile played) |
  | `pass_turn` | `passTurn` | **Turn-ending** (only when pool empty) |
- **Error feedback loop**: every `{ ok: false, error }` from the controller becomes a tool result with the error message; the model is expected to correct itself. This is the core capability-testing surface.
- **Persistent conversation per AI player per game, reset each round** (`startNewRound`). The runner maintains a turn counter per round and appends a **turn-start user message** before each AI turn containing: turn number, a compact observable-events note ("Alice drew a tile", "Bob played a 3-tile set", derived from state diffs recorded by the runner), and a nudge to call `get_game_state`. Without this, a persistent conversation would contain a stale view of the board. State diffs are updated after every turn (including within the runner's `while` loop for chained AI turns).
- **Unbounded growth in this plan**: no compaction (Plan 013). A basic hard iteration cap of 50 tool calls per turn prevents runaway loops (Plan 013 makes it configurable and pauses instead of erroring).
- **Logging**: JSON lines to stdout via a small `aiLogger`: `{ ts, gameCode, playerId, model, level, event, data }` with events `system_prompt`, `request`, `response`, `tool_call`, `tool_result`, `turn_complete`, `error`. `request` logs the full outgoing message array (minus system prompt duplication — log system prompt once per turn); `response` logs the raw assistant message including tool calls and reasoning content where present. Viewed via `docker compose logs -f dev-server`. No file or in-app viewer (explicit scope decision).
- **Failure**: any SDK error or iteration-cap breach → provider throws → runner's existing pause-and-surface path (`ai:error` + stuck banner from Plan 011). No retries in this plan (Plan 013 adds them).
- **Timeouts**: SDK request timeout 300s per completion (models can take minutes on complex boards).

## Acceptance Criteria

1. With `AI_PROVIDER=llm`, `AI_API_KEY`, `AI_BASE_URL`, `AI_DEFAULT_MODEL` set, a human can play a full game against a real model
2. The model completes its turn by calling a turn-ending tool (`draw_tile`, `end_turn`, or `pass_turn`); the game advances normally
3. Invalid moves are rejected with the same messages a human would see, returned as tool results; the model can retry and succeed in the same turn
4. The model never receives other players' racks (only its own `PlayerGameState`)
5. Conversation persists across the AI's turns within a round; every AI player in a game has its own independent conversation
6. Every prompt, response, tool call, and tool result is visible in `docker compose logs` as JSON lines, correlated by `gameCode` + `playerId`
7. SDK errors surface as `ai:error` (stuck banner) and are logged
8. Play Again resets conversations; AI continues playing in the new round
9. `AI_PROVIDER=scripted` behaviour (Plan 011) is completely unaffected

## Edge Cases

- Model emits an invalid tool call (unknown tool name, malformed JSON args) → return a tool result `"Unknown tool"` / `"Invalid arguments: <error>"` so the model can self-correct; repeated malformed calls stop at the 50-iteration cap
- Model produces a plain text reply with no tool call → append a corrective user message ("Call a tool to take your turn") once; if it happens again, end the loop as an error (pause-and-surface)
- Model calls `end_turn` without having played anything and without drawing → controller error returns ("You must draw or play at least one tile") → model should then call `draw_tile`
- Model never calls a turn-ending tool within 50 iterations → error → pause-and-surface
- `AI_API_KEY` missing while `AI_PROVIDER=llm` → immediate provider error → `ai:error` at first AI turn (fail fast, clear message in log + banner)
- Gateway rate-limit/5xx mid-turn → error → pause-and-surface (retry arrives in Plan 013)
- Two AI players in one game → two independent conversations, runs serialized by the runner's busy guard
- Game ends mid-loop (e.g. AI's `end_turn` empties its rack) → controller returns turn result with game-ended flag; loop exits without further calls
- Context window exceeded (gateway error) → pause-and-surface; addressed properly in Plan 013

## E2E and Integration Tests

Real LLM calls are **out of scope for e2e** (slow/costly/flaky) — the Playwright e2e suite continues to use `AI_PROVIDER=scripted`. LLM behaviour is covered by unit/integration tests with a mocked SDK client plus manual validation. Provider factory integration check:

| Test ID | Description | Location / User Flow | Assertions |
|---------|-------------|----------------------|------------|
| TC-AI-10 | Provider factory returns LLM provider when `AI_PROVIDER=llm` (unit, no network) | `packages/server/src/ai/providers/index.test.ts` (factory with env override) | Returns `LlmProvider` instance; runner wires it to the same controller path as scripted |

## Implementation Steps

### Step 1: Server — `openai` dependency and LLM config plumbing

- Add `openai` to `packages/server/package.json`
- `packages/server/src/ai/config.ts`: add `requestTimeoutMs` (default 300000); document that `AI_BASE_URL`/`AI_API_KEY`/`AI_DEFAULT_MODEL` are consumed here (from Plan 011)

**Tests:** config defaults and env overrides.

---

### Step 2: Server — aiLogger

- `packages/server/src/ai/logger.ts` — `aiLog(gameCode, playerId, model, event, data)` → `console.log(JSON.stringify({ ts: new Date().toISOString(), gameCode, playerId, model, event, data }))`. Tiny and synchronous; no deps.

**Tests:** spy on console.log; assert shape and correlation fields.

---

### Step 3: Server — system prompt builder

- `packages/server/src/ai/prompt.ts` — `buildSystemPrompt(playerName, model): string`:
  - Role: "You are \<playerName\>, an AI player in a game of Rummikub (Sabra variant)"
  - Condensed ruleset: valid sets (runs/groups), jokers, initial meld 30, must play ≥1 rack tile to end a turn, no loose tiles, draw to pass, stalemate pass rule
  - Turn protocol: call `get_game_state` first; make moves with tools; a turn MUST end with exactly one of `draw_tile`, `end_turn`, `pass_turn`; tool errors mean the move was rejected — read the message and adapt (like a human seeing a rejection)
  - Strategy hints kept minimal (do not over-coach; we are testing the model)
- `buildTurnStartMessage(turnNumber, eventsNote): string` — user message appended per turn (see Scope Decisions)

**Tests:** prompt contains the rule constants (30, ≥1 rack tile, tool protocol); turn-start message formats events.

---

### Step 4: Server — tool definitions and executor

- `packages/server/src/ai/tools.ts`:
  - `toolSchemas`: OpenAI function-tool JSON schemas for the 7 tools (parameters match `TileSet`/`Tile` shapes already defined in shared types; `end_turn` schema includes optional `newBoard?: TileSet[]`)
  - `executeTool(controller, name, args)` → returns the JSON tool-result string:
    - Auto-generates `set.id` (e.g. `set-${Date.now()}-${idx}`) if omitted by the model for `play_sets` or `manipulate_board`/`end_turn`
    - success: `{ ok: true, state: PlayerGameState }` (compact projection: rack, board, poolSize, opponents' rack sizes)
    - failure: `{ ok: false, error: <rejection message> }`
    - unknown tool / invalid args: `{ ok: false, error: "..." }` (never throws)
- Tile IDs: tools operate on tile `id`s exactly as the human client does; `get_game_state` returns ids

**Tests:** each tool maps to the right controller method; `end_turn` forwards optional `newBoard`; missing `set.id` is auto-generated; controller errors surface verbatim; malformed args produce a readable error result; unknown tool handled.

---

### Step 5: Server — LlmProvider agent loop and provider types

- `packages/server/src/ai/providers/types.ts`:
  - Move `AiProvider` interface here from `scripted.ts`, define `TurnContext`:
    ```typescript
    export interface TurnContext {
      turnNumber: number;
      eventsNote: string;
    }
    export interface AiProvider {
      takeTurn(controller: AiTurnController, context?: TurnContext): Promise<void> | void;
    }
    ```
- `packages/server/src/ai/providers/llm.ts` — `LlmProvider implements AiProvider`:
  - Holds an `openai` client (`baseUrl`, `apiKey`, `timeout` from config)
  - **Model resolution**: looks up active player via `controller.getPlayerId()` from `game.getState().players`, using `player.model || aiConfig.defaultModel`
  - **Conversation store**: module-level `Map<key, ChatMessage[]>` where `key = ${gameCode}:${roundNumber}:${playerId}`; cleared on new round. Expose `resetConversations(gameCode, roundNumber)` called from the play-again hook in handlers.
  - `takeTurn(controller, turnContext)`:
    1. If no conversation yet: push system prompt
    2. Push turn-start user message (turn number + events note from runner)
    3. Loop (max 50 iterations):
       - `chat.completions.create({ model, messages, tools })`
       - Log `request` (message count + last message; full system prompt logged once via `system_prompt` event) and `response` (full assistant message)
       - If assistant message has `tool_calls`: execute each via `executeTool`, log `tool_call`/`tool_result`, append tool results, continue
       - If plain content and no tool call: corrective user message once, else break with error
       - If a turn-ending tool succeeded (`draw_tile`/`end_turn`/`pass_turn` → `ok: true`): stop looping — the controller already advanced the turn and emitted state
    4. Log `turn_complete` (iteration count, actions taken) or throw on error paths
  - Turn-ending detection: `executeTool` flags which tools are turn-ending and whether they succeeded
- Wire the provider factory: `AI_PROVIDER=llm` → `LlmProvider` (missing key → still construct; fail at first turn with clear log)
- `runner.ts`: maintain turn counter per game/round; record observable events between turns (diffing pool size, board tile count, and passes) and update the snapshot after each turn in the `while` loop (covering chained AI turns); pass `TurnContext` into `takeTurn`

**Tests** (`packages/server/src/ai/providers/llm.test.ts`, mocking the openai client):
- First turn: system prompt + turn-start message sent with correct model/tools
- Tool round-trip: model calls `play_sets` with invalid tiles → tool result contains the `Game` rejection message → next request includes it
- Turn-ending tool success exits the loop; no further completions
- Plain-text response → corrective message once; second time → error
- 50-iteration cap → error thrown (runner pausess + `ai:error`)
- Conversation persistence: second `takeTurn` continues the same message array; `resetConversations` clears it
- `ok: false` from `end_turn` does not end the turn
- SDK error → thrown to runner (assert runner's pause path from Plan 011 is reached)

---

### Step 6: Server — play-again reset hook

- `handlers.ts` `game:playAgain`: after `game.startNewRound()`, call `resetConversations(gameCode, newRoundNumber)` and clear per-AI event notes; then `maybeRunNextTurn` (already hooked in Plan 011)

**Tests:** conversations cleared on Play Again; AI takes a turn in the new round with a fresh conversation.

---

### Step 7: Documentation

- `README.md`: full env var table (`AI_PROVIDER=llm`, `AI_BASE_URL`, `AI_API_KEY`, `AI_DEFAULT_MODEL`, `AI_REQUEST_TIMEOUT_MS`) and a "Playing against AI models" section (how to watch logs: `docker compose -f docker-compose.dev.yml logs -f dev-server | grep '"event"'`)
- `docs/prd.md`: add F-43; expand 3.9 with the agent/tool design summary
- `docs/entities.md`: **LlmProvider** entity (tool-calling agent; conversation = ordered messages per game/round/player); relationship `Game → LlmProvider conversation (1:0..N per AI player)`

## Affected Files

| File | Change |
|------|--------|
| `packages/server/package.json` | Add `openai` dependency |
| `packages/server/src/ai/config.ts` | Timeout, provider docs |
| `packages/server/src/ai/logger.ts` | New — JSON-line console logger |
| `packages/server/src/ai/prompt.ts` | New — system prompt + turn-start message builders |
| `packages/server/src/ai/tools.ts` | New — tool schemas + executor |
| `packages/server/src/ai/providers/types.ts` | New — `AiProvider` and `TurnContext` interfaces |
| `packages/server/src/ai/providers/llm.ts` | New — `LlmProvider` agent loop + conversation store |
| `packages/server/src/ai/providers/scripted.ts` | Import `AiProvider` from `./types.js`, accept optional context |
| `packages/server/src/ai/providers/index.ts` | Factory: `llm` branch |
| `packages/server/src/ai/runner.ts` | `turnContext` (turn number + events note), chained turn diffing, `resetConversations` wiring |
| `packages/server/src/handlers.ts` | Play-again reset hook |
| `packages/server/src/ai/*.test.ts` | New tests (logger, prompt, tools, llm provider) |
| `docs/prd.md`, `docs/entities.md`, `README.md` | As above |

## Validation Steps

1. **Automated**: unit tests, typecheck, lint, scripted e2e suite all pass
2. **Manual (real model)** — the point of this plan:
   - Set env: `AI_PROVIDER=llm`, `AI_API_KEY=<key>` (your opencode gateway key), `AI_DEFAULT_MODEL=claude-sonnet-5` (or any model from the gateway list)
   - Start dev server; create a game; add an AI player; start
   - Tail logs: `docker compose -f docker-compose.dev.yml logs -f dev-server` — verify system prompt, per-iteration requests/responses, tool calls and results (including rejection messages when the model attempts invalid moves), and `turn_complete` events
   - Play a full round against the model; try Play Again; verify fresh conversation per round
   - Try at least one cheaper/smaller model (e.g. a `*-free` model) to observe weaker play and heavier retry behaviour
   - Kill the key (`AI_API_KEY=wrong`) and verify the stuck banner appears on the AI's first turn with a clear log line

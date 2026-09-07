# Phase 4.4: AI Debug Console (frontend) — replaces server-side JSON logging

## Goal

Replace the server-side AI conversation logging (JSON lines to stdout, `packages/server/src/ai/logger.ts`) with an **AI debug console in the client**, gated behind `AI_DEBUG=true`:

- AI players at the top of the game screen (and spectator screen) become clickable, opening a single popup panel anchored to the **bottom right** of the screen.
- The panel shows the AI player's **rack** (the private info not already on screen) and a **transcript** of their session with the model.
- The transcript reads like a chat with an AI chatbot and contains four item types, each visually distinct, containing **readable text only (no JSON)**:
  - **Prompt** — input sent to the model (system prompt once, then each turn-start note, corrective prompts)
  - **Thinking** — chain-of-thought (`reasoning_content`) tokens, when the model provides them
  - **Tool call** — the name of each tool the model called (no arguments, no results — deferred)
  - **Response** — the model's output message text
- The transcript is scrollable back to the **start of the round**; full history is available even for clients that joined/reconnected late (server keeps an in-memory buffer; client requests history when the console opens) and live items stream in as they happen.
- The console closes via a close button. With multiple AI players there is **one console**; clicking a different AI player switches it to their transcript/rack.

Server-side stdout logging (`aiLog`, `logger.ts`) is **removed entirely**; PRD/entities/README are updated. Note: showing an AI player's rack to opponents/spectators is a deliberate, debug-only exception to NF-04, acceptable because it is gated behind `AI_DEBUG`.

Prerequisites: Plans 011–013 (AI infrastructure, LlmProvider, robustness/compaction).

## PRD References

- F-43 (rewritten by this plan): see Documentation section below
- NF-04: debug-only exception documented in PRD
- 3.9.1 "Logging" bullet: rewritten (JSON-line events removed)

## Scope Decisions

- **`AI_DEBUG` stays a server env var** (strict `=== "true"`, unchanged `aiConfig.debug`), but its meaning changes: it now gates (a) transcript recording + buffering, (b) live `ai:debug` broadcasts, (c) the `aiDebug: boolean` flag sent to clients in `game:state`, and (d) the `ai:debugHistory` endpoint. When off: no events, no buffer, AI players not clickable.
- **Flag delivery**: `aiDebug: boolean` added to `PlayerGameState` and `SpectatorGameState` (always present, `false` when off) — flows to the client via existing `game:state` / `game:started` emissions, no new endpoint.
- **Transcript items are deltas, not full inputs**: items are recorded at the points where messages are appended to the conversation (system prompt creation, turn-start message, corrective message) — the full conversation is never re-sent per model call.
- **Response items only for actual text**: if the assistant message has null/empty `content` (tool-calls-only completion), no Response item is emitted that iteration.
- **Tool call items are recorded after the tool executes** (name only), so the rack snapshot that accompanies the live event reflects the post-tool state — the console's rack stays fresh even after the final, turn-ending tool call.
- **Transcript buffer is independent of the model conversation**: compaction (Plan 013) folds the model's conversation but the transcript buffer is append-only per round — the debug console shows what actually happened, uncompacted. Compaction/retry/error events are not transcript items (future enhancement).
- **Lifecycle**: transcript buffer keyed `gameCode:roundNumber:playerId`, same lifecycle as the conversation store — dropped for older rounds on Play Again (`resetTranscripts`), purged on 24h game cleanup (`purgeGame`), lost on server restart (existing in-memory behaviour).
- **Scripted provider also records** a synthetic transcript (Prompt at turn start + Tool call per executed verb) so the console is fully testable in e2e without an LLM.
- **One console, switches players**: clicking another AI player swaps the console content and requests that player's history.
- **Spectators** get the same console (they are in the Socket.IO room and receive `ai:debug` / can request history).

## Acceptance Criteria

1. With `AI_DEBUG=true`, AI players in the top strip of the game (and spectator) screen are clickable; clicking opens the debug console popup anchored bottom-right; non-AI players and the `AI_DEBUG=false` case leave the strip non-clickable and unchanged
2. The console shows the AI player's rack (rendered with the existing Tile component) and stays fresh as the AI draws/plays
3. The transcript shows Prompt, Thinking, Tool call and Response items, each in a visually distinct style, readable text only (no raw JSON anywhere)
4. With a reasoning model, Thinking items appear between the Prompt and the Response/Tool calls
5. Tool call items show the tool name only
6. Scrolling reaches the very first item of the round (the system Prompt) even after joining/reconnecting mid-game; live items append while the console is open
7. New items auto-scroll into view only when the user is already at the bottom; scrolling up pins the view
8. The close button dismisses the console; clicking an AI player again reopens it
9. With multiple AI players, clicking a different AI switches the console to that player's rack/transcript
10. Play Again resets the transcript to the new round (client clears on `roundNumber` change; server drops old-round buffers)
11. `AI_DEBUG=false` (default): no `ai:debug` broadcasts, no history, no buffer growth, `aiDebug: false` in state, strip not clickable
12. Server stdout contains no AI JSON log lines anymore (`logger.ts` deleted)

## Edge Cases

- Model returns no `reasoning_content` → no Thinking items (normal for non-reasoning models)
- Assistant message with only tool calls (null content) → Tool call items but no Response item that iteration
- Corrective prompt ("Call a tool to take your turn.") appears as a Prompt item
- The system prompt is long — rendered in full as the first Prompt item of the round (debug tool; scrolling past it is acceptable)
- Client opens console before the AI's first turn → empty transcript + current rack (no crash, sensible empty state)
- `ai:debugHistory` for a non-AI player, unknown player, or while `AI_DEBUG=false` → server responds with an empty items list (or ignores); never throws
- Live `ai:debug` event arriving for a previous round (race after Play Again) → client ignores events whose `roundNumber` doesn't match current state
- Server restart mid-game → transcript lost with the game (existing in-memory behaviour, consistent with conversations)
- 24h game cleanup purges the transcript buffer (no leak)
- Two AI players in one game → independent buffers/transcripts
- Mobile/narrow screens → console panel becomes a bottom sheet spanning the width (responsive, NF-01)

## E2E Tests

The dev server used for e2e must run with `-e AI_DEBUG=true` (see e2e_testing.md change below). The scripted provider records synthetic transcript items, so transcript content is deterministic.

| Test ID | Description | User Flow | Assertions |
|---------|-------------|-----------|------------|
| TC-AI-13 | Debug console opens, shows rack + styled transcript, closes | Start human+AI (scripted) game with `AI_DEBUG=true`; let the AI take a turn; click the AI player at the top | Console panel appears anchored bottom-right; rack tiles are visible; transcript contains at least one Prompt item and one Tool call item; the item types are visually distinguishable (distinct test ids / class names per type); close button hides the console |
| TC-AI-14 | Transcript history scrolls back to the start of the round | Play several AI turns (seeded drawTile script); open the console; scroll the transcript to the top | First transcript item is the initial Prompt (system prompt / first turn-start); items from every turn are present in order; live items append while the console is open during a subsequent AI turn |

(Unit/component tests cover the `AI_DEBUG=false` gating — not clickable, no events — since the shared dev server runs with the flag on.)

## Implementation Steps

### Step 1: Shared — debug types and `aiDebug` flag

- `packages/shared/src/types.ts`:
  - `AiDebugItemType = "prompt" | "thinking" | "tool_call" | "response"`
  - `AiDebugItem { type: AiDebugItemType; text: string; ts: string }` (`text` is the readable message: prompt text / reasoning text / response text / tool name)
  - `AiDebugEventPayload { playerId: string; roundNumber: number; item: AiDebugItem; rack: Tile[] }` (live, one per recorded item)
  - `AiDebugHistoryRequestPayload { playerId: string }` (client → server)
  - `AiDebugHistoryPayload { playerId: string; roundNumber: number; items: AiDebugItem[]; rack: Tile[] }` (server → requesting socket)
  - `PlayerGameState` and `SpectatorGameState` gain `aiDebug: boolean`
- Export new types from `packages/shared/src/index.ts`
- **Tests**: extend `packages/shared/src/types.test.ts` (payload/type shape tests, `aiDebug` field present on both state types)

---

### Step 2: Server — AI debug bus (buffer + broadcast)

- New `packages/server/src/ai/debug.ts`:
  - `const transcripts = new Map<string, AiDebugItem[]>()` keyed `${gameCode}:${roundNumber}:${playerId}` — recorded and buffered **only when `aiConfig.debug`**
  - `recordDebugItem(io, game, playerId, item): void` — appends to the buffer and emits `io.to(gameCode).emit("ai:debug", { playerId, roundNumber, item, rack })` where `rack` is the AI player's rack captured at emit time; no-op when debug is off
  - `getDebugTranscript(game, playerId): AiDebugItem[]` — current-round items (empty when debug off)
  - `resetTranscripts(gameCode, roundNumber)` (drop older rounds), `purgeGame(gameCode)` (drop all rounds for a game), `_clearAllTranscripts()` (test helper) — mirroring the conversation store in `llm.ts`
- **Tests** (`packages/server/src/ai/debug.test.ts`): recording appends and broadcasts with correct payload/rack; no-op when `AI_DEBUG` off; reset/purge lifecycle; per-player/per-round isolation

---

### Step 3: Server — `aiDebug` flag in state, controller debug hook

- `packages/server/src/game.ts`: `getPlayerState` and the spectator state builder set `aiDebug: aiConfig.debug`
- `packages/server/src/ai/controller.ts`: add `recordDebugItem(item: { type: AiDebugItemType; text: string }): void` on `AiTurnController` that delegates to `debug.ts` with the controller's `io`/`game`/`playerId` — both providers already receive the controller, so no extra plumbing
- `packages/server/src/emissions.test.ts` / `game.ts` tests: `aiDebug` reflects the env var (on/off)
- **Tests**: controller method records + broadcasts via the debug bus

---

### Step 4: Server — LlmProvider records the transcript; stdout logging removed

- `packages/server/src/ai/providers/llm.ts`:
  - Remove the `aiLog` import and all three call sites (`request`, `reasoning`, `response` events)
  - Record via `controller.recordDebugItem`:
    - **Prompt** when the system prompt is created (first conversation for the key), when each turn-start message is pushed, and when the corrective message ("Call a tool to take your turn.") is pushed
    - **Thinking** when `reasoning_content` is present (text = reasoning content)
    - **Response** when `message.content` is non-empty text
    - **Tool call** per tool call, recorded **after** `executeTool` returns (text = tool name, e.g. `end_turn`)
- Delete `packages/server/src/ai/logger.ts` and `packages/server/src/ai/logger.test.ts`
- **Tests** (`llm.test.ts`): replace the JSON-logging assertions — a full turn records prompt → (thinking) → response → tool-call items in order with readable text; no `console.log` calls; nothing recorded/broadcast when `AI_DEBUG` off; null-content tool-call completion records Tool call but no Response item

---

### Step 5: Server — scripted provider records a synthetic transcript

- `packages/server/src/ai/providers/scripted.ts`:
  - At turn start record a **Prompt** item (turn number + events note from `TurnContext`, or a simple "Your turn (scripted)" line)
  - Record a **Tool call** item after each controller verb that actually executes (script steps and the fallback draw/pass path), using the tool names (`play_sets`, `draw_tile`, `pass_turn`, …)
- **Tests** (`scripted.test.ts` / provider tests): seeded script records prompt + expected tool-call names in order; fallback path records `draw_tile`/`pass_turn`

---

### Step 6: Server — `ai:debugHistory` handler and lifecycle wiring

- `packages/server/src/handlers.ts`: new `ai:debugHistory` handler — validates the game/player (must be an AI player of that game); responds **only to the requesting socket** with `AiDebugHistoryPayload` (`items` from `getDebugTranscript`, `rack` from the game state, current `roundNumber`); empty items when debug is off or player invalid
- `game:playAgain` handler (next to `resetConversations`): call `resetTranscripts`; `gameManager.ts` cleanup (next to `purgeGame`): call `purgeGame` from `debug.ts`
- **Tests** (`handlers.test.ts`): history returns recorded items + rack to the requesting socket only; unknown/non-AI player → empty items; `AI_DEBUG=false` → empty items

---

### Step 7: Client — debug state, socket wiring, console UI

- New `packages/client/src/contexts/AiDebugContext.tsx` (mounted in `App.tsx`):
  - Holds `transcripts: Record<playerId, AiDebugItem[]>`, `racks: Record<playerId, Tile[]>`, `openPlayerId: string | null`
  - App.tsx socket listeners: `ai:debug` (append item + update rack, ignoring stale `roundNumber`) and `ai:debugHistory` (replace that player's transcript + rack); `requestHistory(playerId)` emits `ai:debugHistory`
  - Clears all transcripts/racks when `roundNumber` changes in game state (Play Again)
- `packages/client/src/components/AiDebugConsole.tsx`:
  - Fixed panel anchored bottom-right (full-width bottom sheet on narrow screens); header with AI player name + model and a **close button**
  - **Rack** section rendering the AI's tiles with the existing `Tile` component
  - **Transcript**: scrollable list; on open / player switch, requests history (if not already loaded); each item type has a distinct style and `data-item-type` attribute:
    - Prompt — left-aligned bubble, neutral/blue, "Prompt" label
    - Thinking — italic, muted/grey, "Thinking" label
    - Tool call — monospace pill, amber, "Tool call: `name`"
    - Response — contrasting (green) label, chat-reply styling
  - Auto-scroll to bottom on new items only when already scrolled to the bottom
- `packages/client/src/components/GameBoard.tsx` (`OpponentInfo`) and the spectator player strip (`SpectateBoard.tsx`): when `isAI && aiDebug`, the AI player entry becomes clickable (button semantics, cursor/hover affordance) and calls `openConsole(playerId)`; otherwise unchanged
- **Tests** (`packages/client/src/ai-debug-console.test.tsx` + `ai-ui.test.tsx` additions): clicking an AI player opens the console (only when `aiDebug`); history request emitted on open; transcript item types render with distinct styles and readable text; rack renders; close button closes; switching AI players switches content and requests that player's history; auto-scroll/scroll-pin behaviour; `aiDebug: false` → strip not clickable

---

### Step 8: E2E tests

- `packages/qa/tests/ai-opponent.spec.ts`: add TC-AI-13 and TC-AI-14 (scripted AI, seeded scripts for deterministic turns; assertions per table above)
- `docs/e2e_testing.md`: add `-e AI_DEBUG=true` to the dev-server run command with a note that the AI debug console tests require it (harmless for other tests)

---

### Step 9: Documentation

- `docs/prd.md`:
  - Rewrite **F-43**: "When `AI_DEBUG=true`, the client shows an AI debug console: AI players in the top player strip are clickable and open a bottom-right panel showing that AI's rack and a readable session transcript (Prompt, Thinking, Tool call, Response items, tool calls by name only); the transcript scrolls back to the start of the round and streams live; full history is served to clients that joined late. The console is available to players and spectators. Showing the AI's rack is a debug-only exception to NF-04."
  - Rewrite the 3.9.1 **Logging** bullet to describe the debug console events (`ai:debug`, `ai:debugHistory`, `aiDebug` flag) instead of JSON stdout lines
- `docs/entities.md`: update the LlmProvider entity row (debug transcript buffered in memory per game/round/player instead of JSON console lines; compaction does not affect the transcript buffer); document the transcript buffer lifecycle
- `README.md`: replace the `docker compose logs` AI-debug recipe with "set `AI_DEBUG=true`, click an AI player in the game UI"; update the `AI_DEBUG` env description
- `.env.dist`: update the `AI_DEBUG` comment (frontend debug console instead of server logs)
- `docker-compose.yml`: unchanged (`AI_DEBUG` already plumbed)

## Affected Files

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | `AiDebugItem`/`AiDebugItemType`, `ai:debug` + `ai:debugHistory` payloads, `aiDebug` on `PlayerGameState`/`SpectatorGameState` |
| `packages/shared/src/index.ts` | Export new types |
| `packages/shared/src/types.test.ts` | New type/payload tests |
| `packages/server/src/ai/debug.ts` | New — transcript buffer + live broadcast |
| `packages/server/src/ai/debug.test.ts` | New |
| `packages/server/src/ai/logger.ts` | **Deleted** |
| `packages/server/src/ai/logger.test.ts` | **Deleted** |
| `packages/server/src/ai/providers/llm.ts` | Remove `aiLog`; record prompt/thinking/response/tool_call items |
| `packages/server/src/ai/providers/llm.test.ts` | Logging tests → debug-recording tests |
| `packages/server/src/ai/providers/scripted.ts` | Record synthetic prompt + tool-call items |
| `packages/server/src/ai/controller.ts` | `recordDebugItem` facade |
| `packages/server/src/game.ts` | `aiDebug` flag in player/spectator state |
| `packages/server/src/handlers.ts` | `ai:debugHistory` handler; `resetTranscripts` on Play Again |
| `packages/server/src/gameManager.ts` | `purgeGame` for transcripts on cleanup |
| `packages/server/src/handlers.test.ts`, `emissions.test.ts`, `game.test.ts`, `scripted` provider tests | Updates per above |
| `packages/client/src/contexts/AiDebugContext.tsx` | New — debug state + history requests |
| `packages/client/src/components/AiDebugConsole.tsx` | New — panel UI |
| `packages/client/src/components/GameBoard.tsx` | `OpponentInfo` clickable when `isAI && aiDebug` |
| `packages/client/src/pages/GameBoard.tsx`, `packages/client/src/pages/SpectateBoard.tsx` | Wire console open on AI player click |
| `packages/client/src/App.tsx` | `ai:debug` / `ai:debugHistory` listeners, context provider |
| `packages/client/src/ai-debug-console.test.tsx`, `ai-ui.test.tsx` | Client tests |
| `packages/qa/tests/ai-opponent.spec.ts` | TC-AI-13, TC-AI-14 |
| `docs/prd.md`, `docs/entities.md`, `docs/e2e_testing.md`, `README.md`, `.env.dist` | As above |

## Validation Steps

1. **Automated**: unit tests, typecheck, lint, e2e suite (dev server with `AI_DEBUG=true`, scripted provider)
2. **Manual (real model)**:
   - `AI_DEBUG=true` + a real reasoning model: open the console during the AI's turn — watch Prompt → Thinking → Response/Tool call items stream live in distinct styles; verify the rack updates after the AI draws/plays
   - Scroll the transcript to the top — first item is the system Prompt; no JSON visible anywhere
   - Reload the page (reconnect) mid-game and open the console — full history from the start of the round is present
   - Play Again — transcript resets to the new round
   - Two AI players — clicking each switches rack + transcript
   - Restart the server with `AI_DEBUG=false` — AI players are no longer clickable, `docker compose logs` shows no AI JSON lines

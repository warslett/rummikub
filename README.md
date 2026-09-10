# Rummikub Online

Online 2-player Rummikub game with real-time gameplay via WebSocket. No login required — create a game, share the URL, and play. Game state is persisted to PostgreSQL, so games survive server restarts: players revisit the game URL and continue where they left off.

## Getting Started

**All development happens inside Docker. Do not install Node.js on the host.**

### Prerequisites

- Docker
- Docker Compose

### Install dependencies

```bash
docker compose -f docker-compose.dev.yml run --rm dev npm install
```

### Start the dev server

```bash
docker compose -f docker-compose.dev.yml up
```

The client dev server runs at **http://localhost:5173** and the server at **http://localhost:3000**.

### Run tests

```bash
# All unit/integration tests
docker compose -f docker-compose.dev.yml run --rm dev npm test

# Single package
docker compose -f docker-compose.dev.yml run --rm dev npm test --workspace=packages/server

# E2E tests (dev server must be running first)
docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e
```

### Lint and type-check

```bash
docker compose -f docker-compose.dev.yml run --rm dev npm run lint
docker compose -f docker-compose.dev.yml run --rm dev npm run typecheck
```

### Build

```bash
docker compose -f docker-compose.dev.yml run --rm dev npm run build
```

### Interactive shell

```bash
docker compose -f docker-compose.dev.yml run --rm dev bash
```

## Project Structure

```
packages/shared/   — Types, constants, validation logic (used by server)
packages/server/   — Express + Socket.IO backend, game state machine
packages/client/   — React + Vite frontend
packages/qa/       — End-to-end tests (Playwright)
docs/              — Project documentation
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (unset) | PostgreSQL connection string for game-state persistence. When set, every game mutation is written through to the `games` table and games survive restarts. When unset, the server runs in-memory only. Production docker-compose always provides it (default `postgres://rummikub:rummikub@postgres:5432/rummikub`), so persistence is on by default there |
| `AI_PROVIDER` | `scripted` | AI turn provider: `scripted` (deterministic, for tests) or `llm` (tool-calling agent against an OpenAI-compatible endpoint) |
| `AI_BASE_URL` | `https://opencode.ai/zen/v1` | Base URL for the OpenAI-compatible chat completions endpoint used by the `llm` provider |
| `AI_API_KEY` | (empty) | API key for the AI gateway. Required when `AI_PROVIDER=llm` (the AI fails fast with a clear error at its first turn if missing) |
| `AI_DEFAULT_MODEL` | `scripted-default` | Default model name pre-selected in the lobby; used by the `llm` provider when an AI player has no model set |
| `AI_REQUEST_TIMEOUT_MS` | `300000` | Per-request timeout in milliseconds for LLM completions (models can take minutes on complex boards) |
| `AI_MAX_RETRIES` | `3` | Maximum retries per completion for transient errors (HTTP 429, 5xx, network errors, timeouts). Retries use exponential backoff (`AI_RETRY_BASE_MS` ×2 + jitter) and are logged as `retry` events. Auth/context-length errors are never retried — they pause immediately. Set to `0` to disable retries |
| `AI_RETRY_BASE_MS` | `1000` | Base backoff delay in milliseconds for the first retry; each subsequent retry doubles it (1s, 2s, 4s for the default 3 retries) |
| `AI_MAX_TOOL_ITERATIONS` | `25` | Hard cap on tool-call iterations per AI turn. Exceeding it pauses the game with a clear log (`reason: "iteration_cap"`). Raise it if a model legitimately needs more calls for complex manipulations |
| `AI_MALFORMED_LIMIT` | `2` | Consecutive completions containing only malformed tool calls (unknown tool, unparseable/non-object arguments) before the game pauses (`reason: "malformed"`). A successful tool call resets the streak. Set to `0` to pause on the first such completion |
| `AI_CONTEXT_TOKEN_LIMIT` | `100000` | Estimated token budget for the AI conversation (chars/4 heuristic). When exceeded, the conversation is compacted before the next turn: older exchanges are folded into a summary and the last `AI_COMPACT_KEEP_TURNS` exchanges are kept |
| `AI_COMPACT_KEEP_TURNS` | `6` | Number of most recent turn exchanges kept verbatim after compaction |
| `AI_DEBUG` | `false` | When `true`, enables the AI debug console in the game UI: AI players in the top strip become clickable and open a panel showing that AI's rack and a readable session transcript (Prompt, Thinking, Tool call, Response). Also gates transcript recording/broadcasting on the server. Off by default |

## Persistence

The production stack (`docker compose up`) runs a `postgres` service with a named volume (`pgdata`) and passes `DATABASE_URL` to the server. Every game mutation is written through to the `games` table (full `GameState` as JSONB); on boot the server restores all non-expired games, so a `docker compose restart` does not lose games — players reconnect via the game URL and continue mid-turn (racks, board, pool, scores, turn snapshot and undo all intact). The AI session is persisted alongside the game (conversations, turn tracking, AI error/pause state and debug transcripts), so each AI resumes with its prior memory and turn numbering after a restart. Games inactive for over 24 hours are deleted from memory and the database (cascade-deleting their AI rows).

When running the server directly, unset `DATABASE_URL` to run in-memory only (no database). Under `docker compose up`, the `DATABASE_URL` mapping always supplies a value (an empty `DATABASE_URL=` is treated as unset and falls back to the bundled postgres service), so opting out of persistence requires removing/commenting the `DATABASE_URL` mapping for the `server` service in `docker-compose.yml` (and optionally not starting the `postgres` service).

### Backing up and restoring the database

```bash
# Backup
docker compose exec postgres pg_dump -U rummikub rummikub > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U rummikub -d rummikub
```

A dump includes the AI session tables, so a restored database also restores each AI's conversation, turn tracking and debug transcript.

## Playing against AI models

Set the provider to `llm` and point it at any OpenAI-compatible gateway:

```bash
AI_PROVIDER=llm \
AI_BASE_URL=https://opencode.ai/zen/v1 \
AI_API_KEY=<your-key> \
AI_DEFAULT_MODEL=claude-sonnet-5 \
docker compose -f docker-compose.dev.yml up
```

Then create a game, add an AI player in the lobby (pick a model from the list), and start. The AI takes its turns through a tool-calling agent loop: it receives the rules and its private state in a system prompt, and plays by calling the same verbs a human has (`get_game_state`, `play_sets`, `manipulate_board`, `undo_turn`, `draw_tile`, `end_turn`, `pass_turn`). Invalid moves are rejected with the same messages a human would see, returned as tool results so the model can retry. The conversation persists across the AI's turns within a round and is reset on Play Again, and it is stored in the database, so a server restart no longer loses the AI's memory or its turn numbering.

Requests sent to the gateway identify the app with a `User-Agent: rummikub-ai/1.0` header and carry a stable `x-opencode-session` per AI conversation (one per game round and player). OpenCode Go requires both; other OpenAI-compatible gateways ignore them.

### Watching the AI's session

Set `AI_DEBUG=true` and click an AI player in the game UI (the top player strip). A debug console opens anchored bottom-right, showing that AI's rack and a readable transcript of its session with the model — Prompt items (system prompt, turn-start notes, corrective prompts), Thinking items (chain-of-thought, when the model provides it), Tool call items (tool name only) and Response items. The transcript scrolls back to the start of the round and streams live; spectators get the same console. No server logs are involved. The transcript is persisted, so the full round history is still there after a server restart. If the model or gateway fails, the game pauses and all players see an error banner (`ai:error`).

### Tuning AI robustness

The `llm` provider is hardened for real-world play:

- **Transient errors are retried**: HTTP 429, 5xx, network errors and request timeouts are retried up to `AI_MAX_RETRIES` times with exponential backoff (`AI_RETRY_BASE_MS` ×2 + jitter). Auth errors (401/403) and context-length errors pause immediately — retrying won't help.
- **Runaway loops are capped**: `AI_MAX_TOOL_ITERATIONS` (default 25) bounds the tool-call loop per turn. If a model needs more calls for a complex manipulation, raise it via env. Two consecutive completions with only malformed tool calls (`AI_MALFORMED_LIMIT`) also pause the game — the model is not coping.
- **Long conversations are compacted**: when the estimated token count (chars/4) exceeds `AI_CONTEXT_TOKEN_LIMIT`, older exchanges are folded into a summary (generated by the same model) and the last `AI_COMPACT_KEEP_TURNS` exchanges are kept. If summarization fails, the conversation is truncated instead of pausing.
- **What pausing looks like**: any unrecoverable failure emits `ai:error` to all players and the game shows a stuck banner ("AI player stuck: … Restart the server to recover."). There is no auto-draw and no intervention endpoint. The paused state is persisted, so a server restart does **not** clear it or re-run the failed AI turn — the game stays paused until you start a new round with **Play Again**, which resets the AI's error, conversation and turn tracking.

## Documentation

| File | Contents |
|------|----------|
| [docs/prd.md](docs/prd.md) | Product requirements — functional/non-functional requirements, architecture, communication protocol, UI design, milestones |
| [docs/rules.md](docs/rules.md) | Official Rummikub rules (Sabra variant) — sets, manipulation, jokers, scoring, time limits |
| [docs/entities.md](docs/entities.md) | Entity model — Tile, TileSet, Player, Pool, Game, TurnAction, TurnSnapshot, GameManager; relationships and ER diagram |
| [docs/coding.md](docs/coding.md) | Coding standards — mandatory TDD process, commands, code style, architecture rules, common pitfalls |
| [docs/unit_testing.md](docs/unit_testing.md) | Unit/integration testing — Vitest commands, conventions, what to test, mocking guidelines |
| [docs/e2e_testing.md](docs/e2e_testing.md) | End-to-end testing — Playwright setup, commands, helpers, test conventions |
| [docs/plan_execution.md](docs/plan_execution.md) | Plan execution — how to execute an existing implementation plan step by step |
| [docs/planning.md](docs/planning.md) | Planning process — how to create implementation plans for features and changes |
| [docs/docker.md](docs/docker.md) | Docker guide — dev/prod environments, running commands, debugging container issues |
| [docs/bug_fixing.md](docs/bug_fixing.md) | Bug fixing process — reproduce with e2e test, investigate, fix with TDD, verify; common investigation paths |

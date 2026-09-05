# Rummikub Online

Online 2-player Rummikub game with real-time gameplay via WebSocket. No login required — create a game, share the URL, and play.

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
| `AI_PROVIDER` | `scripted` | AI turn provider: `scripted` (deterministic, for tests) or `llm` (tool-calling agent against an OpenAI-compatible endpoint) |
| `AI_BASE_URL` | `https://opencode.ai/zen/v1` | Base URL for the OpenAI-compatible chat completions endpoint used by the `llm` provider |
| `AI_API_KEY` | (empty) | API key for the AI gateway. Required when `AI_PROVIDER=llm` (the AI fails fast with a clear error at its first turn if missing) |
| `AI_DEFAULT_MODEL` | `scripted-default` | Default model name pre-selected in the lobby; used by the `llm` provider when an AI player has no model set |
| `AI_REQUEST_TIMEOUT_MS` | `300000` | Per-request timeout in milliseconds for LLM completions (models can take minutes on complex boards) |

## Playing against AI models

Set the provider to `llm` and point it at any OpenAI-compatible gateway:

```bash
AI_PROVIDER=llm \
AI_BASE_URL=https://opencode.ai/zen/v1 \
AI_API_KEY=<your-key> \
AI_DEFAULT_MODEL=claude-sonnet-5 \
docker compose -f docker-compose.dev.yml up
```

Then create a game, add an AI player in the lobby (pick a model from the list), and start. The AI takes its turns through a tool-calling agent loop: it receives the rules and its private state in a system prompt, and plays by calling the same verbs a human has (`get_game_state`, `play_sets`, `manipulate_board`, `undo_turn`, `draw_tile`, `end_turn`, `pass_turn`). Invalid moves are rejected with the same messages a human would see, returned as tool results so the model can retry. The conversation persists across the AI's turns within a round and is reset on Play Again.

### Watching the AI's logs

Every prompt, response, tool call and tool result is logged to the server console as JSON lines, correlated by `gameCode` and `playerId`:

```bash
docker compose -f docker-compose.dev.yml logs -f dev-server | grep '"event"'
```

Events: `system_prompt`, `request`, `response`, `tool_call`, `tool_result`, `turn_complete`, `error`. If the model or gateway fails, the game pauses and all players see an error banner (`ai:error`).

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

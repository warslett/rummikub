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

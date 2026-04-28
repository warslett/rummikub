# AGENTS.md

## Project Overview

Online Rummikub game — 2-player, turn-based, real-time via WebSocket. See `docs/PRD.md` for full requirements.

## Tech Stack

- **Language**: TypeScript (strict mode) across all packages
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + Vite
- **Monorepo**: npm workspaces (`packages/shared`, `packages/server`, `packages/client`, `qa`)
- **Testing**: Vitest (unit/integration), Playwright (e2e)
- **E2E**: Playwright with Chromium (headless), run via `docker-compose.dev.yml` playwright service
- **Deployment**: Docker

## Project Structure

```
docs/              — Project documentation (PRD, architecture decisions, etc.)
packages/shared/   — Types, constants, validation logic (used by server)
packages/server/   — Express + Socket.IO backend, game state machine
packages/client/   — React + Vite frontend
packages/qa/        — End-to-end tests (Playwright)
```

## Test-Driven Development (MANDATORY)

Before making ANY change to source code (excluding config files and project scaffolding), you MUST follow this process without exception:

1. **Write a small test** that verifies the change that needs to be made
2. **Run the test and observe it fail** — confirm the test correctly catches the missing behaviour
3. **Make the minimum changes required** to make the test pass — no more, no less
4. **Run the test again** to ensure it passes
5. **Consider refactorings** that could simplify or improve the code without changing its behaviour
6. **Run all relevant tests** to ensure the refactoring has not broken anything — if it has, revert and retry step 5

Do not skip steps. Do not write production code before a failing test. Do not implement more than the test requires.

## Docker-Based Development (MANDATORY)

**Do NOT install Node.js or npm on the host machine.** All development, testing, and debugging must be done inside Docker containers using docker-compose. The host machine should only have Docker and docker-compose installed.

- **Development**: `docker-compose.dev.yml` — uses the `node:22-bookworm` image with the project source bind-mounted. Named volumes cache `node_modules` so dependencies persist across container restarts.
- **Production**: `docker-compose.yml` — builds optimized images from each package's Dockerfile.

### Running commands in the dev container

Prefix any command with `docker compose -f docker-compose.dev.yml run --rm dev`. For example:

```bash
# Install dependencies (run once, or after changing package.json)
docker compose -f docker-compose.dev.yml run --rm dev npm install

# Run all tests
docker compose -f docker-compose.dev.yml run --rm dev npm test

# Run tests for a single package
docker compose -f docker-compose.dev.yml run --rm dev npm test --workspace=packages/shared
docker compose -f docker-compose.dev.yml run --rm dev npm test --workspace=packages/server
docker compose -f docker-compose.dev.yml run --rm dev npm test --workspace=packages/client

# Run a single test file
docker compose -f docker-compose.dev.yml run --rm dev npx vitest run packages/server/src/game/state-machine.test.ts

# Lint and type-check
docker compose -f docker-compose.dev.yml run --rm dev npm run lint
docker compose -f docker-compose.dev.yml run --rm dev npm run typecheck

# Build all packages
docker compose -f docker-compose.dev.yml run --rm dev npm run build

# Start the dev server (with live reload)
docker compose -f docker-compose.dev.yml up
```

### Running Playwright e2e tests

Playwright runs in a dedicated Docker container based on the official `mcr.microsoft.com/playwright` image. The dev server must be running first.

```bash
# 1. Start the dev server
docker compose -f docker-compose.dev.yml up dev

# 2. In another terminal, run e2e tests
docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e

# Run a specific test by title
docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npx playwright test -g "TC-01"

# Run a specific test file
docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npx playwright test tests/home-page.spec.ts

# View HTML report (after tests run)
docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npx playwright show-report

# First-time setup (install deps + browsers)
bash packages/qa/setup.sh
```

The Playwright container uses `network_mode: host` and connects to the dev server at `http://localhost:5173` (client) and `http://localhost:3000` (server). Override with `BASE_URL` and `SERVER_URL` env vars.

### Building and running production images

```bash
# Build production images
docker compose build

# Build and run a production service
docker compose run --build server
docker compose run --build client

# Run production stack
docker compose up

# Run in detached mode
docker compose up -d

# Stop production stack
docker compose down
```

### Debugging

- `docker compose -f docker-compose.dev.yml up` starts the dev container with ports 3000 (server) and 5173 (client/Vite dev server) exposed.
- To get an interactive shell inside the dev container: `docker compose -f docker-compose.dev.yml run --rm dev bash`
- To view logs from running services: `docker compose -f docker-compose.dev.yml logs -f`
- If `node_modules` are corrupted, reset them: `docker compose -f docker-compose.dev.yml down -v` (this removes the named volumes), then re-run `npm install`.

## Commands

All commands below are run inside the dev container using the prefix `docker compose -f docker-compose.dev.yml run --rm dev`.

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests across all packages |
| `npm test --workspace=packages/shared` | Run shared package tests |
| `npm test --workspace=packages/server` | Run server tests |
| `npm test --workspace=packages/client` | Run client tests |
| `npm run build` | Build all packages |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | Type-check all packages |

E2E tests (require dev server running, run in playwright container):

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | Run all Playwright e2e tests |
| `npx playwright test -g "TC-01"` | Run specific test by title |
| `npx playwright test tests/home-page.spec.ts` | Run specific test file |

Always run the relevant test command after making changes. Run `npm test` from root before finishing a task.

## Code Style

- No comments unless explicitly requested
- Strict TypeScript — no `any`, use proper types
- Named exports preferred over default exports
- Functions and variables use camelCase, types/interfaces use PascalCase
- Files use kebab-case

## Architecture Rules

- **Server is authoritative**: All game logic and validation lives server-side. The client is a thin UI layer.
- **Shared package for types only**: `packages/shared` contains types, constants, and validation. No framework-specific code.
- **Never send private data**: Player rack tiles are never sent to opponents. Only rack size is shared.
- **Game state is immutable on client**: Clients receive state updates from the server via Socket.IO events. They never compute game state locally.

## Testing Conventions

- Test files live alongside source files as `*.test.ts` or `*.test.tsx`
- E2E test files live in `packages/qa/tests/` as `*.spec.ts`
- Each test should be small, focused, and test one thing
- Use descriptive test names: `it('should reject a run with non-consecutive numbers')`
- E2E test names reference phase 1 test cases: `test('TC-01: Home page loads')`
- For server game logic: test the game state machine directly (unit tests)
- For Socket.IO handlers: test event handling and state transitions
- For React components: prefer integration-style tests that verify rendered output
- For e2e: use the shared helpers in `packages/qa/tests/helpers.ts` for common flows (create game, join, start)
- Use the shared validation functions in tests to verify game rules

## Planning

All complex work (multi-step features, non-trivial changes) must start with creating a plan before writing any code. Plans are written as markdown files to `.agents/plans/` (e.g., `.agents/plans/001-tile-manipulation.md`).

When creating a plan:

1. **Research** — read relevant source files, existing tests, and the PRD to understand the current state and requirements
2. **Ask clarifying questions** — confirm functional requirements, non-functional requirements, acceptance criteria, and edge cases with the user before finalising the plan
3. **Write the plan** — include:
   - Goal and scope
   - Affected files and packages
   - Implementation steps (ordered, each small enough to test)
   - Edge cases to handle
   - Acceptance criteria
   - Validation steps (automated tests + any manual checks the user must verify)

Do not start implementation until the plan is complete and the user has confirmed it.

## Common Pitfalls

- Do not implement game rules on the client — all validation is server-side
- Do not use `any` — if a type is complex, define a proper interface
- Do not persist game state to disk — MVP uses in-memory storage only
- Jokers have special rules — always test joker edge cases
- Initial meld (30-point minimum) only applies to a player's first turn
- After tile manipulation, ALL sets on the board must be valid — no orphaned tiles

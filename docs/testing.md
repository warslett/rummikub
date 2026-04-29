# Testing

## Commands

All unit/integration test commands are run inside the dev container using the prefix `docker compose -f docker-compose.dev.yml run --rm dev`. E2E test commands are run in the Playwright container.

### Unit & Integration Tests

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests across all packages |
| `npm test --workspace=packages/shared` | Run shared package tests |
| `npm test --workspace=packages/server` | Run server tests |
| `npm test --workspace=packages/client` | Run client tests |

Always run the relevant test command after making changes. Run `npm test` from root before finishing a task.

### E2E Tests

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

## See Also

- [coding.md](coding.md) — MUST read before writing code changes. Contains TDD process.
- [docker.md](docker.md) — MUST read before running commands in the dev container.
- [entities.md](entities.md) — MUST read when writing tests that involve game data structures.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating test failures or bugs.

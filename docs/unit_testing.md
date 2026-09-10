# Unit Testing

## Commands

npm is not available on the host machine. All commands MUST be run inside the dev container using the prefix `docker compose -f docker-compose.dev.yml run --rm dev`.

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests across all packages |
| `npm test --workspace=packages/shared` | Run shared package tests |
| `npm test --workspace=packages/server` | Run server tests |
| `npm test --workspace=packages/client` | Run client tests |
| `npx vitest run packages/server/src/game/state-machine.test.ts` | Run a single test file |

Always run the relevant test command after making changes. Run `npm test` from root before finishing a task.

## Conventions

- Test files live alongside source files as `*.test.ts` or `*.test.tsx`
- Each test should be small, focused, and test one thing
- Use descriptive test names: `it('should reject a run with non-consecutive numbers')`
- For server game logic: test the game state machine directly (unit tests)
- For Socket.IO handlers: test event handling and state transitions
- For React components: prefer integration-style tests that verify rendered output
- Use the shared validation functions in tests to verify game rules
- Storage tests (`packages/server/src/storage/*.test.ts`) use **pg-mem** (an in-memory Postgres) — no external database is needed to run the unit/integration suite

## See Also

- [e2e_testing.md](e2e_testing.md) — E2E test setup and commands.
- [docker.md](docker.md) — MUST read before running commands in the dev container.
- [coding.md](coding.md) — MUST read before writing code changes. Contains TDD process.
- [entities.md](entities.md) — MUST read when writing tests that involve game data structures.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating test failures or bugs.

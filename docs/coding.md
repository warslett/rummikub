# Coding

## Test-Driven Development (MANDATORY)

Before making ANY change to source code (excluding config files and project scaffolding), you MUST follow this process without exception:

1. **Write a small test** that verifies the change that needs to be made
2. **Run the test and observe it fail** — confirm the test correctly catches the missing behaviour
3. **Make the minimum changes required** to make the test pass — no more, no less
4. **Run the test again** to ensure it passes
5. **Consider refactorings** that could simplify or improve the code without changing its behaviour
6. **Run all relevant tests** to ensure the refactoring has not broken anything — if it has, revert and retry step 5

Do not skip steps. Do not write production code before a failing test. Do not implement more than the test requires.

## Commands

All commands below are run inside the dev container using the prefix `docker compose -f docker-compose.dev.yml run --rm dev`.

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | Type-check all packages |

For test commands, see [unit_testing.md](unit_testing.md) and [e2e_testing.md](e2e_testing.md).

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

## Common Pitfalls

- Do not implement game rules on the client — all validation is server-side
- Do not use `any` — if a type is complex, define a proper interface
- Do not persist game state to disk — MVP uses in-memory storage only
- Jokers have special rules — always test joker edge cases
- Initial meld (30-point minimum) only applies to a player's first turn
- After tile manipulation, ALL sets on the board must be valid — no orphaned tiles

## See Also

- [unit_testing.md](unit_testing.md) — MUST read when writing, running, or modifying unit tests.
- [e2e_testing.md](e2e_testing.md) — MUST read when writing, running, or modifying e2e tests.
- [docker.md](docker.md) — MUST read before running any commands in the dev container.
- [entities.md](entities.md) — MUST read when working with game data structures.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating or fixing bugs.

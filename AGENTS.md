# AGENTS.md

## Project Overview

Online Rummikub game — 2-player, turn-based, real-time via WebSocket.

## Tech Stack

- **Language**: TypeScript (strict mode) across all packages
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + Vite
- **Monorepo**: npm workspaces (`packages/shared`, `packages/server`, `packages/client`, `qa`)
- **Testing**: Vitest (unit/integration), Playwright (e2e)
- **Deployment**: Docker

## Project Structure

```
docs/              — Project documentation
packages/shared/   — Types, constants, validation logic (used by server)
packages/server/   — Express + Socket.IO backend, game state machine
packages/client/   — React + Vite frontend
packages/qa/       — End-to-end tests (Playwright)
```

## Reference Files

Before responding to ANY prompt, you MUST follow these steps IN ORDER. DO NOT begin working on the task until you have completed the prior steps:

1. **Classify** the task and identify what sort of instruction you are being given (e.g. a bug fix, a code change, a plan, a modification of the tests, a question about the codebase etc.)
2. **Scan** the table below and identify ALL reference files whose "WHEN to Read" matches the task
3. **Read** every matching file unless you have read it already during the session (and follow any cross-references within them)
4. **Then** begin working on the task
5. **While working**, if you discover the task touches an area or classification of task you didn't anticipate, re-scan the table and read any newly relevant reference files before continuing

| Reference | WHEN to Read |
|-----------|-------------|
| [entities.md](docs/entities.md) | MUST read when trying to understand game data structures, entities and relationships. |
| [prd.md](docs/prd.md) | MUST read before planning, answering question about or trying to understand product requirements. |
| [rules.md](docs/rules.md) | MUST read before planning any changes to game behaviour or dynamics. |
| [coding.md](docs/coding.md) | MUST read before making ANY code changes. |
| [docker.md](docs/docker.md) | MUST read before building docker images, modifying docker configuration or trying to understand how docker is configured. |
| [planning.md](docs/planning.md) | MUST read before creating any plans. |
| [testing.md](docs/testing.md) | MUST read before writing, running, or modifying any tests. |
| [bug_fixing.md](docs/bug_fixing.md) | MUST read before attempting to investigate or implement any bug fixes, unexpected behaviour, or when a user reports something that doesn't work as they expect. |

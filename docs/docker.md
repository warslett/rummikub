# Docker

**Do NOT install Node.js or npm on the host machine.** All development, testing, and debugging must be done inside Docker containers using docker-compose. The host machine should only have Docker and docker-compose installed.

## Development Environment

`docker-compose.dev.yml` — uses the `node:22-bookworm` image with the project source bind-mounted. Dependencies are installed directly into the bind-mounted directory so they are visible on the host filesystem for IDE support.

## Production Environment

`docker-compose.yml` — builds optimized images from each package's Dockerfile.

## Running Commands in the Dev Container

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

## Building and Running Production Images

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

## Debugging Docker Issues

- `docker compose -f docker-compose.dev.yml up` starts the dev container with ports 3000 (server) and 5173 (client/Vite dev server) exposed.
- To get an interactive shell inside the dev container: `docker compose -f docker-compose.dev.yml run --rm dev bash`
- To view logs from running services: `docker compose -f docker-compose.dev.yml logs -f`
- If `node_modules` are corrupted, reset them: delete the `node_modules` directories from the host, then re-run `npm install`.

## See Also

- [coding.md](coding.md) — MUST read before making code changes. Contains the command reference table.
- [testing.md](testing.md) — MUST read before running tests. Contains Playwright e2e test setup.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating or fixing bugs.

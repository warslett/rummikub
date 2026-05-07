# Docker

**Do NOT install Node.js or npm on the host machine.** All development, testing, and debugging must be done inside Docker containers using docker-compose.

## Development Environment

`docker-compose.dev.yml` — uses the `node:22-bookworm` image with the project source bind-mounted. Dependencies are installed directly into the bind-mounted directory so they are visible on the host filesystem for IDE support.

The dev container has **no default `CMD`** — `docker compose up dev` starts the container but exits immediately. A command must always be passed in explicitly.

## Production Environment

`docker-compose.yml` — builds optimized images from each package's Dockerfile.

## Running Commands in the Dev Container

Prefix any command with `docker compose -f docker-compose.dev.yml run --rm dev`. For example:

```bash
# Install dependencies (run once, or after changing package.json)
docker compose -f docker-compose.dev.yml run --rm dev npm install

# Lint and type-check
docker compose -f docker-compose.dev.yml run --rm dev npm run lint
docker compose -f docker-compose.dev.yml run --rm dev npm run typecheck

# Build all packages
docker compose -f docker-compose.dev.yml run --rm dev npm run build

# Get an interactive shell
docker compose -f docker-compose.dev.yml run --rm dev bash
```

For test commands, see [unit_testing.md](unit_testing.md) and [e2e_testing.md](e2e_testing.md).

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

- The dev container has no default command — `docker compose -f docker-compose.dev.yml up dev` will start the container but it exits immediately. Use `docker compose run` with an explicit command instead.
- To view logs from a running dev server: `docker logs dev-server`
- If `node_modules` are corrupted, reset them: delete the `node_modules` directories from the host, then re-run `npm install`.
- If typecheck passes locally but fails in Docker, you likely forgot to rebuild the shared package: `docker compose -f docker-compose.dev.yml run --rm dev npm run build --workspace=packages/shared`

## See Also

- [coding.md](coding.md) — MUST read before making code changes.
- [unit_testing.md](unit_testing.md) — MUST read before running unit tests.
- [e2e_testing.md](e2e_testing.md) — MUST read before running e2e tests.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating or fixing bugs.

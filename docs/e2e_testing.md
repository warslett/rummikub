# E2E Testing

Playwright runs in a dedicated Docker container based on the official `mcr.microsoft.com/playwright` image. The dev server must be running first.

## Starting the Dev Server

The dev server has no default `CMD` — you must provide the command explicitly:

```bash
docker compose -f docker-compose.dev.yml run -d --name dev-server \
  -p 3000:3000 -p 5173:5173 \
  -e NODE_ENV=test \
  -e AI_PROVIDER=scripted \
  -e AI_DEFAULT_MODEL=test-model \
  -e AI_DEBUG=true \
  dev \
  sh -c "npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npx concurrently 'node --watch packages/server/dist/index.js' 'npx vite packages/client --host 0.0.0.0 --port 5173'"
```

### Why each flag matters

| Flag | Why |
|------|-----|
| `-d` | Run in background so you can then run Playwright in a separate container |
| `--name dev-server` | Allows easy cleanup: `docker rm -f dev-server` |
| `-p 3000:3000 -p 5173:5173` | Publish both ports so the Playwright container can reach them on `localhost` |
| `-e NODE_ENV=test` | Enables the `/test/seed` endpoint on the server. **Without this, all E2E tests that call `seedGame` will fail with 404.** |
| `-e AI_PROVIDER=scripted` | Configures the server to use deterministic scripted AI provider for E2E tests |
| `-e AI_DEFAULT_MODEL=test-model` | Sets default model name for AI player selection in tests |
| `-e AI_DEBUG=true` | Enables the AI debug console (transcript recording, `ai:debug` broadcasts, clickable AI players in the strip). **Required for the AI debug console tests (TC-AI-13/TC-AI-14); harmless for other tests** |
| `npm run build --workspace=packages/shared` | Must rebuild shared before server so the server picks up latest types |
| `npm run build --workspace=packages/server` | Must build server TypeScript before `node --watch` can run it |
| `npx vite packages/client --host 0.0.0.0` | The `--host 0.0.0.0` flag is **required** — without it Vite only listens on localhost inside the container |
| `npx concurrently '...' '...'` | Runs both server and Vite frontend simultaneously |

### Verifying the dev server is ready

```bash
curl -s http://localhost:3000/health
# Should return: {"status":"ok"}

curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
# Should return: 200
```

Wait ~10 seconds after starting the container for both services to be ready.

## Running E2E Tests

```bash
# Run all e2e tests
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

## Cleanup

```bash
docker rm -f dev-server
```

## Common Mistakes

1. **`docker compose up dev`** — Container exits immediately (no default command). Use `docker compose run` with the full command instead.
2. **Missing `NODE_ENV=test`** — The server's `/test/seed` endpoint is gated behind `NODE_ENV === "test"`. Without it, every E2E test that uses `seedGame()` fails.
3. **Missing `--host 0.0.0.0` on Vite** — Vite defaults to `localhost` which is unreachable from other containers. Must bind to `0.0.0.0`.
4. **Forgetting to rebuild shared package** — After changing shared types, you must rebuild both `packages/shared` and `packages/server` before restarting the dev server.

## Conventions

- E2E test files live in `packages/qa/tests/` as `*.spec.ts`
- E2E test names reference phase 1 test cases: `test('TC-01: Home page loads')`
- Use the shared helpers in `packages/qa/tests/helpers.ts` for common flows (create game, join, start)

## See Also

- [unit_testing.md](unit_testing.md) — Unit and integration test commands.
- [docker.md](docker.md) — MUST read before running commands in the dev container.
- [coding.md](coding.md) — MUST read before writing code changes. Contains TDD process.
- [entities.md](entities.md) — MUST read when writing tests that involve game data structures.
- [bug_fixing.md](bug_fixing.md) — MUST read when investigating test failures or bugs.

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
DC="docker compose -f $COMPOSE_FILE"

echo "==> Installing app dependencies..."
$DC run --rm dev npm install

echo "==> Building packages..."
$DC run --rm dev npm run build

echo "==> Installing Playwright dependencies (in isolated qa container)..."
$DC run --rm --no-deps playwright npm install

echo ""
echo "Setup complete! To run e2e tests:"
echo ""
echo "  1. Start the dev server:"
echo "     $DC up dev"
echo ""
echo "  2. In another terminal, run Playwright:"
echo "     $DC run --rm --no-deps playwright npm run test:e2e"
echo ""
echo "  Or run a specific test:"
echo "     $DC run --rm --no-deps playwright npx playwright test -g 'TC-01'"

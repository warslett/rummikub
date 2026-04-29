# Debugging

## Process

When investigating or fixing any bug or erroneous behaviour, follow this process:

### 1. Reproduce with an E2E Test

Write a Playwright e2e test that reliably recreates the issue. This ensures you have a concrete reproduction and a regression guard. The test should:

- Set up the game state needed to trigger the bug
- Perform the exact actions that cause the erroneous behaviour
- Assert the expected (correct) behaviour, which will currently fail

### 2. Investigate

Analyse the code to understand the root cause:

- Read relevant source files and trace the code path that leads to the bug
- Review logs and output from the failing e2e test for error messages or unexpected state
- Consult [entities.md](entities.md) to understand the data structures involved
- Consult [rules.md](rules.md) if the bug relates to game rule enforcement
- Identify the specific code change(s) needed to fix the issue

### 3. Fix Using TDD

Follow the TDD process defined in [coding.md](coding.md):

1. Write a small, focused unit test that verifies the specific fix needed
2. Run the test and observe it fail — confirm it catches the bug
3. Make the minimum code change required to make the test pass
4. Run the test again to ensure it passes
5. Consider refactorings that could simplify or improve the code without changing behaviour
6. Run all relevant tests to ensure nothing is broken

### 4. Verify the Fix

The bug can be considered fixed when:

- The new unit tests pass
- The reproduction e2e test (from step 1) passes
- All existing tests continue to pass (`npm test` from root)

## Common Investigation Paths

| Symptom | Investigate |
|---------|-------------|
| Invalid move accepted | Server move validation in `packages/server/src/game/` |
| Move rejected incorrectly | Server validation logic, compare against [rules.md](rules.md) |
| State not updating on client | Socket.IO event emission in server handlers, client state updates |
| Tile count mismatch | Entity relationships in [entities.md](entities.md), pool/rack management |
| Turn not advancing | Turn management in game state machine |
| Initial meld not enforced | Initial meld check in server validation |

## See Also

- [coding.md](coding.md) — MUST read before making code changes. Contains TDD process.
- [testing.md](testing.md) — MUST read before writing or running tests.
- [docker.md](docker.md) — MUST read when running commands or checking container logs.
- [rules.md](rules.md) — MUST read when debugging game rule enforcement.
- [entities.md](entities.md) — MUST read when debugging data structure issues.

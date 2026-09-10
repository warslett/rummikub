# @rummikub/shared

Single source of truth for game types, constants, and validation logic — used by both server and client. No runtime dependencies, no framework code.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Barrel export — re-exports all public API from submodules |
| `src/types.ts` | Core type definitions: `Tile`, `TileSet`, `Player`, `GameState`, `PlayerGameState`, `SpectatorGameState`, `TurnAction`, `OpponentInfo`, `TurnSnapshot`, Socket.IO event payloads |
| `src/constants.ts` | Game constants: `COLORS`, `VALUES`, tile counts, `JOKER_*` (joker has no color/value and is worth `JOKER_PENALTY` = 30 when left on rack), `INITIAL_HAND_SIZE` (14), `INITIAL_MELD_MINIMUM` (30), `MIN_SET_SIZE`/`MAX_GROUP_SIZE`, `MIN_PLAYERS`/`MAX_PLAYERS` (4), `GAME_CODE_LENGTH`/`GAME_CODE_CHARS` |
| `src/validation.ts` | Rule engine: `isValidRun`, `isValidGroup`, `isValidSet`, `isValidBoard`, `calculateSetValue`, `resolveJokerValue`, `formSetsFromTiles`, `sortSetTiles` + error-reporting API (`getSetValidationError`, `getBoardValidationErrors`, `SetValidationReason`, `SET_ERROR_MESSAGES`) |
| `src/tiles.ts` | Tile generation (`generateAllTiles`: 106 tiles with copy-suffix ids `a`/`b`) and shuffling (`shuffleTiles` — non-mutating Fisher-Yates) |
| `src/*.test.ts` | Co-located vitest tests. `types.test.ts` is compile-time shape checking; `validation.test.ts` covers joker edge cases |

## Structure of types

- `GamePhase`: `"lobby" | "playing" | "ended"`
- `TurnAction`: discriminated union of `placeSet | draw | manipulate | pass`
- `PlayerGameState` / `SpectatorGameState`: discriminated on `type: "player" | "spectator"`; private state (`yourRack`) only ever reaches the owning client
- `GameState` carries turn state (`turnActions`, `turnSnapshot`, `consecutivePasses`, `roundNumber`) and `seededScripts` for AI scripting
- Socket.IO payloads match the `game:*` / `turn:*` / `ai:*` events in the server's `handlers.ts`

## Validation notes

- Runs must be single-color, ascending, ≥ 3 tiles; no wrap 13→1; input must already be in run order
- `isValidGroup` allows a set of ≥3 jokers
- `resolveJokerValue` prefers the group interpretation when a joker could be read either way
- All rule enforcement happens server-side; the client uses these helpers only for pre-validation and display

# @rummikub/shared

Single source of truth for game types, constants, and validation logic — used by both server and client.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Barrel export — re-exports all public API from submodules |
| `src/types.ts` | Core type definitions: `Tile`, `TileSet`, `Player`, `GameState`, `PlayerGameState`, `TurnAction`, Socket.IO event payloads |
| `src/constants.ts` | Game constants: colors, values, tile counts, initial meld minimum, game code config |
| `src/validation.ts` | Rule engine: `isValidRun`, `isValidGroup`, `isValidBoard`, `calculateSetValue`, `resolveJokerValue`, `formSetsFromTiles` |
| `src/tiles.ts` | Tile generation (`generateAllTiles`) and shuffling (`shuffleTiles`) |


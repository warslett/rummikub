import type { TileSet, PlayerGameState } from "@rummikub/shared";
import type { AiTurnController } from "./controller.js";

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolExecutionOutcome {
  ok: boolean;
  error?: string;
  content: string;
  turnEnded: boolean;
  malformed?: boolean;
}

const TILE_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: 'Tile id, e.g. "red-7-a" or "joker-1". Must reference a tile from your rack or the board.',
    },
    color: { type: "string", enum: ["red", "blue", "orange", "black", "joker"] },
    value: { type: "number" },
  },
  required: ["id"],
} as const;

const SET_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Optional unique set id; generated automatically if omitted." },
    tiles: { type: "array", items: TILE_SCHEMA, minItems: 3 },
  },
  required: ["tiles"],
} as const;

export const toolSchemas: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "get_game_state",
      description:
        "Get the current game state from your perspective: your rack, the board, pool size, opponents (names, rack sizes, scores) and your initial-meld status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "play_sets",
      description:
        "Place one or more new sets from your rack onto the board. Does not end your turn. All tiles must come from your rack and every resulting set must be valid.",
      parameters: {
        type: "object",
        properties: {
          sets: { type: "array", items: SET_SCHEMA, minItems: 1 },
        },
        required: ["sets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manipulate_board",
      description:
        "Rearrange the board by submitting the complete new board (all sets, including existing ones). Every set on the new board must be valid; tiles may come from the board or your rack. Does not end your turn.",
      parameters: {
        type: "object",
        properties: {
          newBoard: { type: "array", items: SET_SCHEMA },
        },
        required: ["newBoard"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_turn",
      description: "Revert everything you have done this turn (board and rack back to the turn start).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "draw_tile",
      description: "Draw a tile from the pool. Ends your turn.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "end_turn",
      description:
        "End your turn. Only allowed if you played at least one tile from your rack this turn (or drew). Optionally pass newBoard to rearrange the board before ending.",
      parameters: {
        type: "object",
        properties: {
          newBoard: { type: "array", items: SET_SCHEMA },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pass_turn",
      description: "Pass without playing. Only allowed when the pool is empty. Ends your turn.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function parseArgs(args: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (args === undefined || args === null) {
    return { ok: true, args: {} };
  }
  let parsed: unknown = args;
  if (typeof args === "string") {
    if (args.trim() === "") {
      return { ok: true, args: {} };
    }
    try {
      parsed = JSON.parse(args);
    } catch (err) {
      return { ok: false, error: `Invalid arguments: ${(err as Error).message}` };
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Invalid arguments: expected a JSON object" };
  }
  return { ok: true, args: parsed as Record<string, unknown> };
}

function getArrayArg(args: Record<string, unknown>, key: string): { ok: true; value: unknown[] } | { ok: false; error: string } {
  const value = args[key];
  if (!Array.isArray(value)) {
    return { ok: false, error: `Invalid arguments: ${key} must be an array` };
  }
  return { ok: true, value };
}

function withGeneratedSetIds(sets: unknown[]): { ok: true; value: TileSet[] } | { ok: false; error: string } {
  const result: TileSet[] = [];
  for (let idx = 0; idx < sets.length; idx++) {
    const set = sets[idx];
    if (typeof set !== "object" || set === null || Array.isArray(set)) {
      return { ok: false, error: "Invalid arguments: each set must be an object" };
    }
    const record = set as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.length > 0 ? record.id : `set-${Date.now()}-${idx}`;
    result.push({ ...record, id } as TileSet);
  }
  return { ok: true, value: result };
}

function fullStateProjection(state: PlayerGameState) {
  return {
    rack: state.yourRack,
    board: state.board,
    poolSize: state.poolSize,
    hasInitialMeld: state.hasInitialMeld,
    hasPlayedThisTurn: state.hasPlayedThisTurn,
    opponents: state.opponents.map((o) => ({ name: o.name, rackSize: o.rackSize, score: o.score })),
  };
}

function compactStateProjection(state: PlayerGameState) {
  return {
    rack: state.yourRack,
    board: state.board,
    poolSize: state.poolSize,
    opponents: state.opponents.map((o) => ({ name: o.name, rackSize: o.rackSize })),
  };
}

function success(state: PlayerGameState, projection: "full" | "compact"): ToolExecutionOutcome {
  const projected = projection === "full" ? fullStateProjection(state) : compactStateProjection(state);
  return { ok: true, content: JSON.stringify({ ok: true, state: projected }), turnEnded: false };
}

function failure(error: string): ToolExecutionOutcome {
  return { ok: false, error, content: JSON.stringify({ ok: false, error }), turnEnded: false };
}

function malformedFailure(error: string): ToolExecutionOutcome {
  return { ok: false, error, content: JSON.stringify({ ok: false, error }), turnEnded: false, malformed: true };
}

export function executeTool(
  controller: AiTurnController,
  name: string,
  args: unknown
): ToolExecutionOutcome {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    return malformedFailure(parsed.error);
  }
  const argsRecord = parsed.args;

  switch (name) {
    case "get_game_state": {
      return success(controller.getMyState().state, "full");
    }
    case "play_sets": {
      const sets = getArrayArg(argsRecord, "sets");
      if (!sets.ok) {
        return malformedFailure(sets.error);
      }
      const withIds = withGeneratedSetIds(sets.value);
      if (!withIds.ok) {
        return malformedFailure(withIds.error);
      }
      const result = controller.playSets(withIds.value);
      return result.ok ? success(result.state, "compact") : failure(result.error);
    }
    case "manipulate_board": {
      const newBoard = getArrayArg(argsRecord, "newBoard");
      if (!newBoard.ok) {
        return malformedFailure(newBoard.error);
      }
      const withIds = withGeneratedSetIds(newBoard.value);
      if (!withIds.ok) {
        return malformedFailure(withIds.error);
      }
      const result = controller.manipulateBoard(withIds.value);
      return result.ok ? success(result.state, "compact") : failure(result.error);
    }
    case "undo_turn": {
      const result = controller.undoTurn();
      return result.ok ? success(result.state, "compact") : failure(result.error);
    }
    case "draw_tile": {
      const result = controller.drawTile();
      if (!result.ok) {
        return failure(result.error);
      }
      return { ok: true, content: JSON.stringify({ ok: true, state: compactStateProjection(result.state) }), turnEnded: true };
    }
    case "end_turn": {
      let newBoard: TileSet[] | undefined;
      if (argsRecord.newBoard !== undefined) {
        const parsedBoard = getArrayArg(argsRecord, "newBoard");
        if (!parsedBoard.ok) {
          return malformedFailure(parsedBoard.error);
        }
        const withIds = withGeneratedSetIds(parsedBoard.value);
        if (!withIds.ok) {
          return malformedFailure(withIds.error);
        }
        newBoard = withIds.value;
      }
      const result = controller.endTurn(newBoard);
      if (!result.ok) {
        return failure(result.error);
      }
      return { ok: true, content: JSON.stringify({ ok: true, state: compactStateProjection(result.state) }), turnEnded: true };
    }
    case "pass_turn": {
      const result = controller.passTurn();
      if (!result.ok) {
        return failure(result.error);
      }
      return { ok: true, content: JSON.stringify({ ok: true, state: compactStateProjection(result.state) }), turnEnded: true };
    }
    default:
      return malformedFailure(`Unknown tool: ${name}`);
  }
}

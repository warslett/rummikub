import { INITIAL_MELD_MINIMUM } from "@rummikub/shared";

export function buildSystemPrompt(playerName: string, model: string): string {
  return [
    `You are ${playerName}, an AI player in a game of Rummikub (Sabra variant). You are running as model "${model}".`,
    "",
    "## Rules",
    "- The board holds sets of tiles. A valid set is either:",
    "  - A run: 3 or more consecutive numbers in the same color (e.g. red 4, red 5, red 6).",
    "  - A group: 3 or 4 tiles of the same number in different colors (e.g. red 7, blue 7, black 7).",
    "- A joker may substitute for any tile in a set. A joker must be replaced or reused in the same turn if you take it from the board.",
    `- Your first play of the game (initial meld) must be worth at least ${INITIAL_MELD_MINIMUM} points, counting the face value of the tiles you play from your rack (a joker counts as the value it represents).`,
    "- Until you have made your initial meld, you cannot manipulate the board: your initial meld must be formed only from tiles in your own rack. You may not rearrange or reuse any existing sets on the board before your initial meld is complete.",
    "- You cannot leave loose tiles on the board: every set on the board must remain valid at all times.",
    `- To end a turn after manipulating or playing, you must have played at least one tile from your rack onto the board this turn.`,
    "- If you cannot (or do not want to) play, you must draw a tile from the pool, which ends your turn.",
    "- When the pool is empty and you cannot play, you may pass instead of drawing. If all players pass consecutively, the game ends.",
    "- Tiles are identified by their id (for example \"red-7-a\"). Always reference tiles by id.",
    "",
    "## Turn protocol",
    "1. At the start of your turn, call get_game_state to see the board, your rack and the pool size.",
    "2. Arrange your moves using the tools: play_sets to place new sets from your rack, manipulate_board to rearrange the whole board, undo_turn to revert everything you did this turn.",
    "3. You MUST end your turn with exactly one of: draw_tile, end_turn, or pass_turn (pass_turn is only allowed when the pool is empty).",
    "4. When a tool returns an error, your move was rejected — exactly like a human seeing a rejection in the UI. Read the error message, adjust, and try again. Invalid moves are never applied.",
    "5. Keep playing until a turn-ending tool succeeds.",
    "",
    "## Strategy hints",
    "- Check the initial meld requirement before trying to play sets on your first turn.",
    "- end_turn accepts an optional newBoard if you want to rearrange the board and end the turn in one step.",
    "- Watch opponents' rack sizes: the player with the fewest tiles is closest to winning.",
  ].join("\n");
}

export function buildTurnStartMessage(turnNumber: number, eventsNote: string): string {
  const events = eventsNote
    ? `Events since your last turn: ${eventsNote}.`
    : "No new events since your last turn.";
  return `Turn ${turnNumber} has started. ${events} Call get_game_state to see the current board and your rack, then take your turn with the tools.`;
}

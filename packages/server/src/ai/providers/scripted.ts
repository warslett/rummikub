import type { AiTurnController } from "../controller.js";
import { buildTurnStartMessage } from "../prompt.js";
import type { AiProvider, TurnContext } from "./types.js";

export type { AiProvider, TurnContext } from "./types.js";

const TOOL_NAMES = {
  playSets: "play_sets",
  manipulateBoard: "manipulate_board",
  undoTurn: "undo_turn",
  drawTile: "draw_tile",
  endTurn: "end_turn",
  passTurn: "pass_turn",
} as const;

export class ScriptedProvider implements AiProvider {
  async takeTurn(controller: AiTurnController, context?: TurnContext): Promise<void> {
    const game = controller.getGame();
    const playerId = controller.getPlayerId();
    const script = game.getState().seededScripts?.[playerId];

    controller.recordDebugItem({
      type: "prompt",
      text: buildTurnStartMessage(context?.turnNumber ?? 1, context?.eventsNote ?? ""),
    });

    const fallbackDrawOrPass = () => {
      const drawRes = controller.drawTile();
      if (!drawRes.ok) {
        controller.undoTurn();
        const retryDraw = controller.drawTile();
        if (!retryDraw.ok) {
          const passRes = controller.passTurn();
          if (!passRes.ok) {
            throw new Error(passRes.error || "Failed to pass turn");
          }
          controller.recordDebugItem({ type: "tool_call", text: TOOL_NAMES.passTurn });
          return;
        }
        controller.recordDebugItem({ type: "tool_call", text: TOOL_NAMES.drawTile });
        return;
      }
      controller.recordDebugItem({ type: "tool_call", text: TOOL_NAMES.drawTile });
    };

    if (!script || script.length === 0) {
      fallbackDrawOrPass();
      return;
    }

    let turnEnded = false;
    for (const step of script) {
      if (step.action === "fail") {
        throw new Error(step.message);
      }
      let res: { ok: boolean; error?: string };
      switch (step.action) {
        case "playSets":
          res = controller.playSets(step.sets);
          break;
        case "manipulateBoard":
          res = controller.manipulateBoard(step.newBoard);
          break;
        case "undoTurn":
          res = controller.undoTurn();
          break;
        case "drawTile":
          res = controller.drawTile();
          if (res.ok) turnEnded = true;
          break;
        case "endTurn":
          res = controller.endTurn(step.newBoard);
          if (res.ok) turnEnded = true;
          break;
        case "passTurn":
          res = controller.passTurn();
          if (res.ok) turnEnded = true;
          break;
      }
      if (!res.ok) {
        break;
      }
      controller.recordDebugItem({ type: "tool_call", text: TOOL_NAMES[step.action] });
      if (turnEnded) {
        break;
      }
    }

    if (!turnEnded) {
      fallbackDrawOrPass();
    }
  }
}

import type { AiTurnController } from "../controller.js";
import type { AiProvider, TurnContext } from "./types.js";

export type { AiProvider, TurnContext } from "./types.js";

export class ScriptedProvider implements AiProvider {
  async takeTurn(controller: AiTurnController, _context?: TurnContext): Promise<void> {
    const game = controller.getGame();
    const playerId = controller.getPlayerId();
    const script = game.getState().seededScripts?.[playerId];

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
        }
      }
    };

    if (!script || script.length === 0) {
      fallbackDrawOrPass();
      return;
    }

    let turnEnded = false;
    for (const step of script) {
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
      if (turnEnded) {
        break;
      }
    }

    if (!turnEnded) {
      fallbackDrawOrPass();
    }
  }
}

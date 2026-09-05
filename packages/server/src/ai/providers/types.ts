import type { AiTurnController } from "../controller.js";

export interface TurnContext {
  turnNumber: number;
  eventsNote: string;
}

export interface AiProvider {
  takeTurn(controller: AiTurnController, context?: TurnContext): Promise<void> | void;
}

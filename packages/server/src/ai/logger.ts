import { aiConfig } from "./config.js";

export type AiLogEvent = "request" | "reasoning" | "response";

export function aiLog(
  gameCode: string,
  playerId: string,
  model: string,
  event: AiLogEvent,
  data: unknown
): void {
  if (!aiConfig.debug) {
    return;
  }
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      gameCode,
      playerId,
      model,
      event,
      data,
    })
  );
}

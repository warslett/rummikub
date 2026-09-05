export type AiLogEvent =
  | "system_prompt"
  | "request"
  | "response"
  | "tool_call"
  | "tool_result"
  | "turn_complete"
  | "error";

export function aiLog(
  gameCode: string,
  playerId: string,
  model: string,
  event: AiLogEvent,
  data: unknown
): void {
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

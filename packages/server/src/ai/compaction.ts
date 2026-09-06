import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { aiConfig } from "./config.js";
import { withRetries } from "./retry.js";

export const COMPACTION_NOTE =
  "Earlier conversation summarized. Board state is authoritative via `get_game_state`; do not rely on exact earlier tile positions.";

const SUMMARIZATION_PROMPT = `You are summarizing the earlier conversation of a Rummikub AI player so a fresh context window can continue the game.

Summarize concisely and factually:
- The moves the player made and their outcomes
- Rejected attempts and why they were rejected
- Strategy notes and observations about the game

Do not invent game state. The current board and rack are always available via get_game_state.`;

export function estimateTokens(messages: ChatCompletionMessageParam[]): number {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
    }
    if ("tool_calls" in message && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        if (call.type === "function") {
          chars += call.function.name.length + call.function.arguments.length;
        }
      }
    }
  }
  return Math.ceil(chars / 4);
}

export function needsCompaction(messages: ChatCompletionMessageParam[], limit: number): boolean {
  return estimateTokens(messages) > limit;
}

function isTurnStart(message: ChatCompletionMessageParam): boolean {
  return message.role === "user" && typeof message.content === "string" && /^Turn \d+ has started/.test(message.content);
}

function serializeMessages(messages: ChatCompletionMessageParam[]): string {
  return messages
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      const toolCalls =
        "tool_calls" in m && Array.isArray(m.tool_calls)
          ? m.tool_calls
              .filter((c) => c.type === "function")
              .map((c) => `${c.function.name}(${c.function.arguments})`)
              .join("; ")
          : "";
      return `${m.role}: ${content}${toolCalls ? ` [calls: ${toolCalls}]` : ""}`;
    })
    .join("\n");
}

export interface CompactOptions {
  keepExchanges: number;
  model: string;
}

export interface CompactResult {
  messages: ChatCompletionMessageParam[];
  mode: "summary" | "fallback" | "noop";
}

function prefixFirstKept(
  kept: ChatCompletionMessageParam[],
  prefix: string
): ChatCompletionMessageParam[] {
  const [first, ...rest] = kept;
  if (!first) {
    return kept;
  }
  const existing = typeof first.content === "string" ? first.content : "";
  return [{ ...first, content: `${prefix}\n\n${existing}` }, ...rest];
}

export async function compact(
  conversation: ChatCompletionMessageParam[],
  client: OpenAI,
  options: CompactOptions
): Promise<CompactResult> {
  const { keepExchanges, model } = options;
  const system = conversation[0]?.role === "system" ? conversation[0] : undefined;
  const rest = system ? conversation.slice(1) : conversation;

  const turnStartIndices = rest
    .map((m, i) => (isTurnStart(m) ? i : -1))
    .filter((i) => i >= 0);

  const keepFrom =
    turnStartIndices.length > keepExchanges
      ? turnStartIndices[turnStartIndices.length - keepExchanges]
      : 0;

  const older = rest.slice(0, keepFrom);
  const kept = rest.slice(keepFrom);

  if (older.length === 0) {
    return { messages: conversation, mode: "noop" };
  }

  try {
    const summary = await summarize(client, model, older);
    const summaryPrefix = `[Summary of earlier conversation]: ${summary}\n\n${COMPACTION_NOTE}`;
    const base: ChatCompletionMessageParam[] = system ? [system] : [];
    return { messages: [...base, ...prefixFirstKept(kept, summaryPrefix)], mode: "summary" };
  } catch {
    const base: ChatCompletionMessageParam[] = system ? [system] : [];
    return { messages: [...base, ...prefixFirstKept(kept, COMPACTION_NOTE)], mode: "fallback" };
  }
}

async function summarize(
  client: OpenAI,
  model: string,
  older: ChatCompletionMessageParam[]
): Promise<string> {
  const completion = await withRetries(
    () =>
      client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SUMMARIZATION_PROMPT },
          { role: "user", content: serializeMessages(older) },
        ],
        tools: [],
        max_tokens: 2000,
        stream: false,
      }),
    { maxRetries: aiConfig.maxRetries, baseMs: aiConfig.retryBaseMs }
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Summarization returned no content");
  }
  return content;
}
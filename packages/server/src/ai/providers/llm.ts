import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessage } from "openai/resources/chat/completions.js";
import { aiConfig } from "../config.js";
import { buildSystemPrompt, buildTurnStartMessage } from "../prompt.js";
import { executeTool, toolSchemas } from "../tools.js";
import { withRetries } from "../retry.js";
import { compact, needsCompaction } from "../compaction.js";
import { queueAiWrite, getAiStore } from "../../storage/aiStore.js";
import type { AiProvider, TurnContext } from "./types.js";
import type { AiTurnController } from "../controller.js";

const conversations = new Map<string, ChatCompletionMessageParam[]>();

const PROVIDER_USER_AGENT = "rummikub-ai/1.0";

function providerRequestHeaders(sessionId: string): Record<string, string> {
  return {
    "User-Agent": PROVIDER_USER_AGENT,
    "x-opencode-session": sessionId,
  };
}

function persistConversation(key: string, messages: ChatCompletionMessageParam[]): void {
  const snapshot = JSON.parse(JSON.stringify(messages)) as ChatCompletionMessageParam[];
  const gameCode = key.split(":")[0];
  queueAiWrite(`aiconv:${gameCode}`, () => getAiStore().upsertConversation(key, snapshot));
}

export async function restoreConversations(): Promise<void> {
  const records = await getAiStore().loadAllConversations();
  conversations.clear();
  for (const record of records) {
    conversations.set(record.key, record.messages);
  }
}

export function unloadConversations(): void {
  conversations.clear();
}

export function resetConversations(gameCode: string, roundNumber: number): void {
  for (const key of [...conversations.keys()]) {
    if (!key.startsWith(`${gameCode}:`)) {
      continue;
    }
    const keyRound = Number(key.split(":")[1]);
    if (Number.isFinite(keyRound) && keyRound < roundNumber) {
      conversations.delete(key);
    }
  }
  queueAiWrite(`aiconv:${gameCode}`, () =>
    getAiStore().deleteConversationsBeforeRound(gameCode, roundNumber)
  );
}

export function purgeGame(gameCode: string): void {
  for (const key of [...conversations.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      conversations.delete(key);
    }
  }
  queueAiWrite(`aiconv:${gameCode}`, () => getAiStore().deleteGameConversations(gameCode));
}

export function _clearAllConversations(): void {
  conversations.clear();
}

function readableReasoning(reasoning: unknown): string {
  if (typeof reasoning === "string") {
    return reasoning;
  }
  if (Array.isArray(reasoning)) {
    return reasoning
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : String(part)
      )
      .join("\n");
  }
  return reasoning == null ? "" : JSON.stringify(reasoning);
}

export class LlmProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client =
      client ??
      new OpenAI({
        apiKey: aiConfig.apiKey || "missing-api-key",
        baseURL: aiConfig.baseUrl,
        timeout: aiConfig.requestTimeoutMs,
        maxRetries: 0,
      });
  }

  async takeTurn(controller: AiTurnController, context?: TurnContext): Promise<void> {
    const playerId = controller.getPlayerId();
    const game = controller.getGame();
    const state = game.getState();
    const gameCode = state.id;
    const roundNumber = state.roundNumber;
    const player = state.players.find((p) => p.id === playerId);
    const playerName = player?.name ?? playerId;
    const model = player?.model || aiConfig.defaultModel;

    if (!aiConfig.apiKey) {
      const message = "AI_API_KEY is required when AI_PROVIDER=llm";
      throw new Error(message);
    }

    const key = `${gameCode}:${roundNumber}:${playerId}`;
    const requestHeaders = providerRequestHeaders(`rummikub-${key}`);

    try {
      let conversation = conversations.get(key);
      if (!conversation) {
        conversation = [];
        const systemPrompt = buildSystemPrompt(playerName, model);
        conversation.push({ role: "system", content: systemPrompt });
        conversations.set(key, conversation);
        persistConversation(key, conversation);
        controller.recordDebugItem({ type: "prompt", text: systemPrompt });
      }

      const turnStartMessage = buildTurnStartMessage(
        context?.turnNumber ?? 1,
        context?.eventsNote ?? ""
      );
      if (needsCompaction(conversation, aiConfig.contextTokenLimit)) {
        const { messages: compacted } = await compact(conversation, this.client, {
          keepExchanges: aiConfig.compactKeepTurns,
          model,
          headers: requestHeaders,
        });
        conversations.set(key, compacted);
        conversation = compacted;
        persistConversation(key, conversation);
      }
      conversation.push({ role: "user", content: turnStartMessage });
      controller.recordDebugItem({ type: "prompt", text: turnStartMessage });

      let correctiveSent = false;
      let malformedStreak = 0;
      const actions: string[] = [];
      const maxIterations = aiConfig.maxToolIterations;

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        let message: ChatCompletionMessage | undefined;
        try {
          message = await this.createCompletion(model, conversation, requestHeaders);
        } catch (err) {
          throw err instanceof Error ? err : new Error("Unknown LLM error");
        }

        if (!message) {
          throw new Error("LLM response contained no message");
        }

        const reasoning = (message as { reasoning_content?: unknown }).reasoning_content;
        const thinkingText = readableReasoning(reasoning);
        if (thinkingText.length > 0) {
          controller.recordDebugItem({ type: "thinking", text: thinkingText });
        }
        if (typeof message.content === "string" && message.content.length > 0) {
          controller.recordDebugItem({ type: "response", text: message.content });
        }

        if (message.tool_calls && message.tool_calls.length > 0) {
          conversation.push({
            role: "assistant",
            content: message.content,
            tool_calls: message.tool_calls,
          });

          let turnEnded = false;
          let succeeded = false;
          let malformed = false;
          for (const toolCall of message.tool_calls) {
            if (turnEnded) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ ok: false, error: "Turn has already ended" }),
              });
              continue;
            }

            const name = toolCall.type === "function" ? toolCall.function.name : "";
            const rawArgs = toolCall.type === "function" ? toolCall.function.arguments : undefined;
            const outcome = executeTool(controller, name, rawArgs);
            actions.push(name);
            controller.recordDebugItem({ type: "tool_call", text: name });

            conversation.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: outcome.content,
            });

            if (outcome.ok) {
              succeeded = true;
            }
            if (outcome.malformed) {
              malformed = true;
            }
            if (outcome.turnEnded) {
              turnEnded = true;
            }
          }

          if (succeeded) {
            malformedStreak = 0;
          } else if (malformed) {
            malformedStreak++;
            if (malformedStreak >= aiConfig.malformedLimit) {
              const messageText = `AI produced only malformed tool calls for ${aiConfig.malformedLimit} consecutive completions`;
              throw new Error(messageText);
            }
          }

          if (turnEnded) {
            return;
          }
          continue;
        }

        if (!correctiveSent) {
          correctiveSent = true;
          conversation.push({ role: "assistant", content: message.content });
          conversation.push({ role: "user", content: "Call a tool to take your turn." });
          controller.recordDebugItem({ type: "prompt", text: "Call a tool to take your turn." });
          continue;
        }

        throw new Error("AI produced no tool call");
      }

      throw new Error(`AI did not end its turn within ${maxIterations} iterations`);
    } finally {
      const current = conversations.get(key);
      if (current) {
        persistConversation(key, current);
      }
    }
  }

  private async createCompletion(
    model: string,
    messages: ChatCompletionMessageParam[],
    headers: Record<string, string>
  ): Promise<ChatCompletionMessage | undefined> {
    const completion = await withRetries(
      () =>
        this.client.chat.completions.create(
          {
            model,
            messages,
            tools: toolSchemas,
            stream: false,
          },
          { headers }
        ),
      { maxRetries: aiConfig.maxRetries, baseMs: aiConfig.retryBaseMs }
    );
    return completion.choices[0]?.message;
  }
}
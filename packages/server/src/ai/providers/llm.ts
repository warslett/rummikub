import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessage } from "openai/resources/chat/completions.js";
import { aiConfig } from "../config.js";
import { aiLog } from "../logger.js";
import { buildSystemPrompt, buildTurnStartMessage } from "../prompt.js";
import { executeTool, toolSchemas } from "../tools.js";
import { withRetries } from "../retry.js";
import { compact, estimateTokens, needsCompaction } from "../compaction.js";
import type { AiProvider, TurnContext } from "./types.js";
import type { AiTurnController } from "../controller.js";

const conversations = new Map<string, ChatCompletionMessageParam[]>();

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
}

export function purgeGame(gameCode: string): void {
  for (const key of [...conversations.keys()]) {
    if (key.startsWith(`${gameCode}:`)) {
      conversations.delete(key);
    }
  }
}

function parseToolResult(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export function _clearAllConversations(): void {
  conversations.clear();
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
      aiLog(gameCode, playerId, model, "error", { message });
      throw new Error(message);
    }

    const key = `${gameCode}:${roundNumber}:${playerId}`;
    let conversation = conversations.get(key);
    if (!conversation) {
      conversation = [];
      const systemPrompt = buildSystemPrompt(playerName, model);
      aiLog(gameCode, playerId, model, "system_prompt", { content: systemPrompt });
      conversation.push({ role: "system", content: systemPrompt });
      conversations.set(key, conversation);
    }

    if (needsCompaction(conversation, aiConfig.contextTokenLimit)) {
      const beforeTokens = estimateTokens(conversation);
      const { messages: compacted, mode } = await compact(conversation, this.client, {
        keepExchanges: aiConfig.compactKeepTurns,
        model,
        gameCode,
        playerId,
      });
      conversations.set(key, compacted);
      conversation = compacted;

      conversation.push({
        role: "user",
        content: buildTurnStartMessage(context?.turnNumber ?? 1, context?.eventsNote ?? ""),
      });

      aiLog(gameCode, playerId, model, "compaction", {
        beforeTokens,
        afterTokens: estimateTokens(conversation),
        mode,
      });
    } else {
      conversation.push({
        role: "user",
        content: buildTurnStartMessage(context?.turnNumber ?? 1, context?.eventsNote ?? ""),
      });
    }

    let correctiveSent = false;
    let malformedStreak = 0;
    const actions: string[] = [];
    const maxIterations = aiConfig.maxToolIterations;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      aiLog(gameCode, playerId, model, "request", {
        iteration,
        messageCount: conversation.length,
        lastMessage: conversation[conversation.length - 1],
      });

      let message: ChatCompletionMessage | undefined;
      try {
        message = await this.createCompletion(model, conversation, gameCode, playerId, iteration);
      } catch (err) {
        const messageText = err instanceof Error ? err.message : "Unknown LLM error";
        aiLog(gameCode, playerId, model, "error", { iteration, message: messageText });
        throw err instanceof Error ? err : new Error(messageText);
      }

      if (!message) {
        aiLog(gameCode, playerId, model, "error", { iteration, message: "LLM response contained no message" });
        throw new Error("LLM response contained no message");
      }

      aiLog(gameCode, playerId, model, "response", { iteration, message });

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

          aiLog(gameCode, playerId, model, "tool_call", { iteration, name, arguments: rawArgs });
          aiLog(gameCode, playerId, model, "tool_result", {
            iteration,
            name,
            ok: outcome.ok,
            error: outcome.error,
            turnEnded: outcome.turnEnded,
            result: parseToolResult(outcome.content),
          });

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
            aiLog(gameCode, playerId, model, "error", { iteration, message: messageText, reason: "malformed" });
            throw new Error(messageText);
          }
        }

        if (turnEnded) {
          aiLog(gameCode, playerId, model, "turn_complete", { iterations: iteration, actions });
          return;
        }
        continue;
      }

      if (!correctiveSent) {
        correctiveSent = true;
        conversation.push({ role: "assistant", content: message.content });
        conversation.push({ role: "user", content: "Call a tool to take your turn." });
        continue;
      }

      aiLog(gameCode, playerId, model, "error", {
        message: "Model replied with plain text instead of a tool call twice",
      });
      throw new Error("AI produced no tool call");
    }

    aiLog(gameCode, playerId, model, "error", {
      message: `Model did not end its turn within ${maxIterations} iterations`,
      reason: "iteration_cap",
    });
    throw new Error(`AI did not end its turn within ${maxIterations} iterations`);
  }

  private async createCompletion(
    model: string,
    messages: ChatCompletionMessageParam[],
    gameCode: string,
    playerId: string,
    iteration: number
  ): Promise<ChatCompletionMessage | undefined> {
    const completion = await withRetries(
      () =>
        this.client.chat.completions.create({
          model,
          messages,
          tools: toolSchemas,
          stream: false,
        }),
      { maxRetries: aiConfig.maxRetries, baseMs: aiConfig.retryBaseMs },
      (attempt, delayMs, error) => {
        aiLog(gameCode, playerId, model, "retry", {
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
          iteration,
        });
      }
    );
    return completion.choices[0]?.message;
  }
}
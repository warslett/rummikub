import { describe, it, expect, vi, afterEach } from "vitest";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { estimateTokens, needsCompaction, compact, COMPACTION_NOTE } from "./compaction.js";

function turnStart(n: number): ChatCompletionMessageParam {
  return {
    role: "user",
    content: `Turn ${n} has started. No new events since your last turn. Call get_game_state to see the current board and your rack, then take your turn with the tools.`,
  };
}

function assistantToolCall(id: string, name: string, args: string): ChatCompletionMessageParam {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: args } }],
  };
}

function toolResult(id: string, content: string): ChatCompletionMessageParam {
  return { role: "tool", tool_call_id: id, content };
}

function buildConversation(turns: number): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "You are an AI player in a game of Rummikub." },
  ];
  for (let t = 1; t <= turns; t++) {
    messages.push(turnStart(t));
    messages.push(assistantToolCall(`call-${t}-1`, "get_game_state", "{}"));
    messages.push(toolResult(`call-${t}-1`, JSON.stringify({ ok: true, state: { board: [], rack: [] } })));
    messages.push(assistantToolCall(`call-${t}-2`, "draw_tile", "{}"));
    messages.push(toolResult(`call-${t}-2`, JSON.stringify({ ok: true, state: { rack: [{ id: "red-1-a" }] } })));
  }
  return messages;
}

interface StubCall {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: unknown;
  max_tokens?: number;
  headers?: Record<string, string>;
}

interface StubClient {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
  responses: (Error | Record<string, unknown>)[];
  calls: StubCall[];
}

function createStubClient(): StubClient {
  const responses: (Error | Record<string, unknown>)[] = [];
  const calls: StubCall[] = [];
  const create = vi.fn(
    async (
      args: { model: string; messages: ChatCompletionMessageParam[]; tools: unknown; max_tokens?: number },
      options?: { headers?: Record<string, string> }
    ) => {
      calls.push({ ...args, headers: options?.headers });
      const next = responses.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }
  );
  return { chat: { completions: { create } }, responses, calls };
}

const SESSION_HEADERS = {
  "User-Agent": "rummikub-ai/1.0",
  "x-opencode-session": "rummikub-TEST01:1:ai-1",
};

const OPTIONS = { keepExchanges: 2, model: "test-model", headers: SESSION_HEADERS };

describe("estimateTokens", () => {
  it("should estimate tokens as ceil(chars / 4)", () => {
    expect(estimateTokens([{ role: "user", content: "abcd" }])).toBe(1);
    expect(estimateTokens([{ role: "user", content: "abcdefgh" }])).toBe(2);
    expect(estimateTokens([{ role: "user", content: "abc" }])).toBe(1);
  });

  it("should handle null content on assistant tool_calls messages", () => {
    const messages = [assistantToolCall("call-1", "get_game_state", "{}")];
    expect(estimateTokens(messages)).toBeGreaterThan(0);
  });

  it("should count tool call names and arguments", () => {
    const messages = [assistantToolCall("call-1", "get_game_state", "{}")];
    const withToolCall = estimateTokens(messages);
    const without = estimateTokens([{ role: "assistant", content: null }]);
    expect(withToolCall).toBeGreaterThan(without);
  });
});

describe("needsCompaction", () => {
  it("should return false when under the limit", () => {
    const conversation = buildConversation(2);
    expect(needsCompaction(conversation, 100000)).toBe(false);
  });

  it("should return true when over the limit", () => {
    const conversation = buildConversation(2);
    expect(needsCompaction(conversation, 1)).toBe(true);
  });
});

describe("compact", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should leave the conversation untouched when under the keep threshold", async () => {
    const conversation = buildConversation(1);
    const client = createStubClient();

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(result.messages).toBe(conversation);
    expect(client.calls).toHaveLength(0);
  });

  it("should summarize older messages and keep the last K exchanges", async () => {
    const conversation = buildConversation(10);
    const client = createStubClient();
    client.responses.push({
      choices: [{ message: { role: "assistant", content: "The player drew a tile each turn." } }],
    });

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(client.calls).toHaveLength(1);
    const summaryCall = client.calls[0];
    expect(summaryCall.tools).toEqual([]);
    expect(summaryCall.max_tokens).toBe(2000);
    expect(summaryCall.model).toBe("test-model");
    const summaryUser = summaryCall.messages[1];
    expect(String(summaryUser.content)).toContain("Turn 1 has started");
    expect(String(summaryUser.content)).toContain("draw_tile");

    expect(result.mode).toBe("summary");
    expect(result.messages[0].role).toBe("system");
    const summaryMessage = result.messages[1];
    expect(summaryMessage.role).toBe("user");
    expect(String(summaryMessage.content)).toContain("[Summary of earlier conversation]: The player drew a tile each turn.");
    expect(String(summaryMessage.content)).toContain(COMPACTION_NOTE);
    expect(String(summaryMessage.content)).toContain("Turn 9 has started");

    const kept = result.messages.slice(1);
    expect(kept[0].role).toBe("user");
    expect(String(kept[0].content)).toContain("Turn 9 has started");
    expect(kept[kept.length - 1].role).toBe("tool");
    expect(kept).toHaveLength(10);
  });

  it("should keep the token estimate under the limit after compaction", async () => {
    const conversation = buildConversation(10);
    const client = createStubClient();
    client.responses.push({
      choices: [{ message: { role: "assistant", content: "The player drew a tile each turn." } }],
    });

    const limit = 400;
    expect(needsCompaction(conversation, limit)).toBe(true);

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(needsCompaction(result.messages, limit)).toBe(false);
  });

  it("should fall back to truncation when summarization fails", async () => {
    const conversation = buildConversation(10);
    const client = createStubClient();
    client.responses.push(new Error("Gateway timeout"));

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(result.mode).toBe("fallback");
    expect(result.messages[0].role).toBe("system");
    const noteMessage = result.messages[1];
    expect(noteMessage.role).toBe("user");
    expect(String(noteMessage.content)).toContain(COMPACTION_NOTE);
    expect(String(noteMessage.content)).toContain("Turn 9 has started");
    expect(result.messages.slice(1)).toHaveLength(10);
  });

  it("should not crash on a short conversation over a tiny limit", async () => {
    const conversation = buildConversation(1);
    const client = createStubClient();

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(result.messages).toBe(conversation);
    expect(result.mode).toBe("noop");
    expect(client.calls).toHaveLength(0);
  });

  it("should send the conversation session headers on the summarization request", async () => {
    const conversation = buildConversation(10);
    const client = createStubClient();
    client.responses.push({
      choices: [{ message: { role: "assistant", content: "The player drew a tile each turn." } }],
    });

    await compact(conversation, client as unknown as OpenAI, OPTIONS);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].headers).toEqual(SESSION_HEADERS);
  });

  it("should never produce consecutive user messages after compaction (gateway role compatibility)", async () => {
    const conversation = buildConversation(10);
    const client = createStubClient();
    client.responses.push({
      choices: [{ message: { role: "assistant", content: "The player drew a tile each turn." } }],
    });

    const result = await compact(conversation, client as unknown as OpenAI, OPTIONS);

    for (let i = 1; i < result.messages.length; i++) {
      if (result.messages[i].role === "user") {
        expect(result.messages[i - 1].role).not.toBe("user");
      }
    }
  });
});
import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildTurnStartMessage } from "./prompt.js";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt("AI: claude-sonnet-5", "claude-sonnet-5");

  it("should address the player by name and the Sabra variant", () => {
    expect(prompt).toContain("AI: claude-sonnet-5");
    expect(prompt).toContain("Sabra");
  });

  it("should include the initial meld minimum of 30", () => {
    expect(prompt).toContain("30");
  });

  it("should require at least one rack tile to end a turn", () => {
    expect(prompt).toMatch(/at least one .* rack/i);
  });

  it("should explain that the board cannot be manipulated before the initial meld", () => {
    expect(prompt).toMatch(/cannot manipulate the board/i);
    expect(prompt).toMatch(/initial meld/i);
  });

  it("should explain that board tiles can be moved to the rack to enable more plays", () => {
    expect(prompt).toMatch(/move tiles from the board (?:to|onto) your rack/i);
    expect(prompt).toMatch(/split existing sets/i);
    expect(prompt).toMatch(/new sets/i);
  });

  it("should require tiles taken from the board to be back on the board before ending the turn", () => {
    expect(prompt).toMatch(/before you end your turn/i);
    expect(prompt).toMatch(/valid arrangement/i);
  });

  it("should include the turn protocol with the turn-ending tools", () => {
    expect(prompt).toContain("get_game_state");
    expect(prompt).toContain("draw_tile");
    expect(prompt).toContain("end_turn");
    expect(prompt).toContain("pass_turn");
    expect(prompt).toMatch(/exactly one/i);
  });

  it("should explain that tool errors are rejections to adapt to", () => {
    expect(prompt).toMatch(/error/i);
    expect(prompt).toMatch(/reject/i);
  });
});

describe("buildTurnStartMessage", () => {
  it("should include the turn number", () => {
    const message = buildTurnStartMessage(1, "");
    expect(message).toContain("1");
  });

  it("should format the events note into the message", () => {
    const message = buildTurnStartMessage(3, "Alice drew a tile; Bob made changes to the board and ended his turn");
    expect(message).toContain("Alice drew a tile; Bob made changes to the board and ended his turn");
  });

  it("should note when there are no new events", () => {
    const message = buildTurnStartMessage(2, "");
    expect(message).toMatch(/no new events/i);
  });
});

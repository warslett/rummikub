import { test, expect, CLIENT_URL, SERVER_URL, createGame, addAiPlayer, startGameWithAi, seedGame, reloadServer } from "./helpers";
import type { SeedState } from "./helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { io as createSocket } from "socket.io-client";
import type { Socket } from "socket.io-client";

interface ServerPlayer {
  id: string;
  name: string;
  isAI?: boolean;
}

interface ServerGameState {
  phase: string;
  players: ServerPlayer[];
  currentTurnIndex: number;
  board: { id: string; tiles: unknown[] }[];
  pool: unknown[];
}

async function getGameStateFromServer(gameCode: string): Promise<ServerGameState> {
  const resp = await fetch(`${SERVER_URL}/test/game/${gameCode}`);
  return (await resp.json()) as ServerGameState;
}

function makePool(size: number) {
  return Array.from({ length: size }, (_, i) => ({
    id: `blue-${i + 1}-a`,
    color: "blue",
    value: (i % 13) + 1,
  }));
}

async function reconnectViaUi(
  browser: Browser,
  playerId: string,
  gameCode: string,
  path: string
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(CLIENT_URL);
  await page.evaluate(
    (ids) => {
      localStorage.setItem("rummikub_playerId", ids.playerId);
      localStorage.setItem("rummikub_gameCode", ids.gameCode);
    },
    { playerId, gameCode }
  );
  await page.goto(`${CLIENT_URL}${path}`);
  await page.waitForTimeout(2000);
  return { ctx, page };
}

function connectAndRecordAiErrors(gameCode: string, playerId: string): Promise<{ socket: Socket; errors: unknown[] }> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(SERVER_URL, { transports: ["websocket"] });
    const errors: unknown[] = [];
    socket.on("ai:error", (payload: unknown) => {
      errors.push(payload);
    });
    socket.on("connect", () => {
      socket.emit("game:reconnect", { gameCode, playerId });
      setTimeout(() => resolve({ socket, errors }), 1500);
    });
    socket.on("connect_error", reject);
  });
}

test.describe("AI session persistence", () => {
  test("TC-AI-17: AI session survives restart", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();

    const gameCode = await createGame(page1, "Alice");
    await addAiPlayer(page1);
    await startGameWithAi(page1);

    const state = await getGameStateFromServer(gameCode);
    const human = state.players.find((p) => !p.isAI)!;
    const ai = state.players.find((p) => p.isAI)!;

    // Seed a deterministic draw-only AI so every AI turn records prompt + tool_call
    await seedGame(gameCode, {
      board: [],
      racks: {
        [human.id]: [{ id: "red-1-a", color: "red", value: 1 }],
        [ai.id]: [{ id: "red-2-a", color: "red", value: 2 }],
      },
      pool: makePool(30),
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { [human.id]: true, [ai.id]: true },
      aiScripts: { [ai.id]: [{ action: "drawTile" }] },
    } satisfies SeedState);

    // AI turn 1 runs on seed; then it is Alice's turn
    await expect(page1.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });
    // Alice draws -> AI turn 2
    await page1.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page1.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    const playerId = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    // Simulated restart
    const restored = await reloadServer();
    expect(restored).toBeGreaterThanOrEqual(1);

    // Reconnect the human after the restart
    const { ctx: ctx2, page: page2 } = await reconnectViaUi(browser, playerId, gameCode, `/game/${gameCode}`);
    await expect(page2.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Alice draws -> AI turn 3; numbering must continue (not reset to 1)
    await page2.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page2.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Open the AI debug console: the restored transcript contains every pre- and post-reload turn
    await page2.getByTestId("ai-debug-player").first().click();
    const consolePanel = page2.getByTestId("ai-debug-console");
    await expect(consolePanel).toBeVisible();

    // Three AI turns (1 and 2 before the restart, 3 after): prompt + tool_call each, in order
    const transcriptItems = consolePanel.locator("[data-item-type]");
    await expect(transcriptItems).toHaveCount(6, { timeout: 10000 });
    const types = await transcriptItems.evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.itemType)
    );
    expect(types).toEqual(["prompt", "tool_call", "prompt", "tool_call", "prompt", "tool_call"]);

    // Turn numbering continued across the restart (Turn 3, not a reset to Turn 1)
    const prompts = consolePanel.locator('[data-item-type="prompt"]');
    await expect(prompts.nth(0)).toContainText("Turn 1");
    await expect(prompts.nth(1)).toContainText("Turn 2");
    await expect(prompts.nth(2)).toContainText("Turn 3");

    // The AI continued to take its turn normally after the restart
    const after = await getGameStateFromServer(gameCode);
    expect(after.players[after.currentTurnIndex].id).toBe(human.id);

    ctx2.close();
    ctx1.close();
  });

  test("TC-AI-18: Paused AI error survives restart", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();

    const gameCode = await createGame(page1, "Alice");
    await addAiPlayer(page1);
    await startGameWithAi(page1);

    const state = await getGameStateFromServer(gameCode);
    const human = state.players.find((p) => !p.isAI)!;
    const ai = state.players.find((p) => p.isAI)!;

    await seedGame(gameCode, {
      board: [],
      racks: {
        [human.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        [ai.id]: [],
      },
      pool: [{ id: "black-5-a", color: "black", value: 5 }],
      currentTurnPlayerId: ai.id,
      hasInitialMeld: { [human.id]: true, [ai.id]: true },
      aiScripts: { [ai.id]: [{ action: "fail", message: "Seeded failure" }] },
    } satisfies SeedState);

    // The AI turn errors and the game pauses on the failed AI
    await expect(page1.getByText(`AI player stuck:`)).toBeVisible({ timeout: 10000 });
    const before = await getGameStateFromServer(gameCode);
    expect(before.players[before.currentTurnIndex].id).toBe(ai.id);
    const boardBefore = JSON.stringify(before.board);
    const poolBefore = before.pool.length;

    const playerId = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    // Simulated restart
    const restored = await reloadServer();
    expect(restored).toBeGreaterThanOrEqual(1);

    // Reconnect the human: the persisted AI error must prevent the failed turn from re-running
    const { ctx: ctx2, page: page2 } = await reconnectViaUi(browser, playerId, gameCode, `/game/${gameCode}`);
    await expect(page2.getByText(/Pool:/)).toBeVisible({ timeout: 10000 });
    await page2.waitForTimeout(1500);

    const after = await getGameStateFromServer(gameCode);
    expect(after.phase).toBe("playing");
    expect(after.players[after.currentTurnIndex].id).toBe(ai.id);
    expect(JSON.stringify(after.board)).toBe(boardBefore);
    expect(after.pool.length).toBe(poolBefore);

    // A fresh reconnect (which triggers the AI scheduler) must not re-run the broken AI or emit a new error
    const { socket, errors } = await connectAndRecordAiErrors(gameCode, playerId);
    expect(errors).toHaveLength(0);
    socket.close();

    const stillPaused = await getGameStateFromServer(gameCode);
    expect(stillPaused.players[stillPaused.currentTurnIndex].id).toBe(ai.id);
    expect(stillPaused.pool.length).toBe(poolBefore);

    ctx2.close();
    ctx1.close();
  });
});

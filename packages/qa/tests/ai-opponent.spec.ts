import { test, expect, CLIENT_URL, SERVER_URL, createGame, joinGame, addAiPlayer, startGameWithAi, getPoolCount } from "./helpers";
import type { Page } from "@playwright/test";

async function getGameStateFromServer(gameCode: string) {
  const resp = await fetch(`${SERVER_URL}/test/game/${gameCode}`);
  return resp.json();
}

async function seedGameServer(gameCode: string, state: unknown) {
  const resp = await fetch(`${SERVER_URL}/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameCode, state }),
  });
  expect(resp.ok).toBe(true);
}

test.describe("AI Player Infrastructure", () => {
  test("TC-AI-01: Add AI player in lobby", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await expect(page.getByRole("button", { name: "Add AI Player" })).toBeVisible();

    await addAiPlayer(page);

    await expect(page.getByText(/AI:/)).toBeVisible();
    await expect(page.locator("span").filter({ hasText: /^AI$/ }).first()).toBeVisible();
    await expect(page.getByText("2/4 players")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Game" })).toBeVisible();

    await ctx.close();
  });

  test("TC-AI-02: AI takes its turn automatically", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    // If Alice is first, draw to pass to AI
    const yourTurnVisible = await page.getByText(/Your turn/i).first().isVisible().catch(() => false);
    if (yourTurnVisible) {
      await page.getByRole("button", { name: "Draw Tile" }).click();
    }

    // AI should take its turn and advance back to Alice
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    await ctx.close();
  });

  test("TC-AI-03: AI draw decrements pool", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    const yourTurn = await page.getByText(/Your turn/i).first().isVisible().catch(() => false);
    if (!yourTurn) {
      // AI went first, wait until Alice's turn
      await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });
    }

    // Now it's Alice's turn. Get initial pool count
    const poolBeforeDraw = parseInt(await getPoolCount(page), 10);
    // Alice draws: pool decrements by 1
    await page.getByRole("button", { name: "Draw Tile" }).click();

    // Now it's AI's turn. AI will auto-draw.
    // Wait until it's Alice's turn again
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    const poolAfterAi = parseInt(await getPoolCount(page), 10);
    // 1 drawn by Alice + 1 drawn by AI = 2 fewer tiles in pool
    expect(poolAfterAi).toBe(poolBeforeDraw - 2);

    await ctx.close();
  });

  test("TC-AI-04: Remove AI player before start", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await createGame(page, "Alice");
    await addAiPlayer(page);
    await expect(page.getByText("2/4 players")).toBeVisible();

    const removeBtn = page.getByRole("button", { name: "×" });
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    await expect(page.getByText("1/4 players")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Game" })).toBeHidden();

    await ctx.close();
  });

  test("TC-AI-05: Add AI blocked when lobby is full", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await createGame(page, "Alice");
    await addAiPlayer(page);
    await addAiPlayer(page);
    await addAiPlayer(page);

    await expect(page.getByText("4/4 players")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add AI Player" })).toBeDisabled();

    await ctx.close();
  });

  test("TC-AI-06: Mixed 3-player rotation (Alice + Bob + AI)", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await addAiPlayer(page1);

    await page1.getByRole("button", { name: "Start Game" }).click();
    await page1.waitForURL(/\/game\//);
    await page2.waitForURL(/\/game\//);

    // Initial order: Alice (p1) -> Bob (p2) -> AI (p3)
    await expect(page1.getByText(/Your turn/i).first()).toBeVisible({ timeout: 5000 });
    // Alice draws
    await page1.getByRole("button", { name: "Draw Tile" }).click();

    // Now it's Bob's turn
    await expect(page2.getByText(/Your turn/i).first()).toBeVisible({ timeout: 5000 });
    // Bob draws
    await page2.getByRole("button", { name: "Draw Tile" }).click();

    // Now AI auto-draws, and turn should return to Alice
    await expect(page1.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-AI-07: AI badge on game board", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    await expect(page.locator("span").filter({ hasText: /^AI/ }).first()).toBeVisible();

    await ctx.close();
  });

  test("TC-AI-08: AI wins the game", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayer = gameState.players.find((p: { isAI?: boolean }) => p.isAI);

    const meldSet = {
      id: "set-win",
      tiles: [
        { id: "red-10-a", color: "red", value: 10 },
        { id: "red-11-a", color: "red", value: 11 },
        { id: "red-12-a", color: "red", value: 12 },
      ],
    };

    // Seed state: AI has exactly meldSet in rack, and aiScripts to play it and end turn
    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        [aiPlayer.id]: meldSet.tiles,
      },
      pool: [{ id: "black-5-a", color: "black", value: 5 }],
      currentTurnPlayerId: aiPlayer.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [aiPlayer.id]: true,
      },
      aiScripts: {
        [aiPlayer.id]: [
          { action: "playSets", sets: [meldSet] },
          { action: "endTurn" },
        ],
      },
    });

    // Game should end, GameOver page displayed, AI declared winner
    await expect(page.getByText("Game Over")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`${aiPlayer.name} Wins!`)).toBeVisible();

    await ctx.close();
  });

  test("TC-AI-09: Play Again with AI", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayer = gameState.players.find((p: { isAI?: boolean }) => p.isAI);

    const meldSet = {
      id: "set-win",
      tiles: [
        { id: "red-10-a", color: "red", value: 10 },
        { id: "red-11-a", color: "red", value: 11 },
        { id: "red-12-a", color: "red", value: 12 },
      ],
    };

    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        [aiPlayer.id]: meldSet.tiles,
      },
      pool: [{ id: "black-5-a", color: "black", value: 5 }],
      currentTurnPlayerId: aiPlayer.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [aiPlayer.id]: true,
      },
      aiScripts: {
        [aiPlayer.id]: [
          { action: "playSets", sets: [meldSet] },
          { action: "endTurn" },
        ],
      },
    });

    await expect(page.getByText("Game Over")).toBeVisible({ timeout: 10000 });

    // Click Play Again
    await page.getByRole("button", { name: "Play Again" }).click();

    // Round 2 should start
    await expect(page.getByText(/Round 2/)).toBeVisible({ timeout: 8000 });
    // AI should still be in opponents list
    await expect(page.locator("span").filter({ hasText: /^AI/ }).first()).toBeVisible();

    await ctx.close();
  });

  test("TC-AI-11: Scripted provider failure shows stuck banner", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayer = gameState.players.find((p: { isAI?: boolean }) => p.isAI);

    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        [aiPlayer.id]: [],
      },
      pool: [{ id: "black-5-a", color: "black", value: 5 }],
      currentTurnPlayerId: aiPlayer.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [aiPlayer.id]: true,
      },
      aiScripts: {
        [aiPlayer.id]: [{ action: "fail", message: "Seeded failure" }],
      },
    });

    await expect(
      page.getByText(`AI player stuck: ${aiPlayer.name} — Seeded failure. Restart the server to recover.`)
    ).toBeVisible({ timeout: 10000 });

    // Game does not advance: the failed AI is still the current turn player
    const stateAfter = await getGameStateFromServer(gameCode);
    expect(stateAfter.players[stateAfter.currentTurnIndex].id).toBe(aiPlayer.id);

    await ctx.close();
  });

  test("TC-AI-12: First AI turn succeeds before second AI errors", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await addAiPlayer(page);
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayers = gameState.players.filter((p: { isAI?: boolean }) => p.isAI);
    const ai1 = aiPlayers[0];
    const ai2 = aiPlayers[1];

    const meldSet = {
      id: "set-1",
      tiles: [
        { id: "red-7-a", color: "red", value: 7 },
        { id: "red-8-a", color: "red", value: 8 },
        { id: "red-9-a", color: "red", value: 9 },
      ],
    };

    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        // Extra tile so ai1 does not empty its rack and win the game
        [ai1.id]: [...meldSet.tiles, { id: "black-1-a", color: "black", value: 1 }],
        // Non-empty rack so the game does not end via checkGameEnd before ai2's turn
        [ai2.id]: [{ id: "black-2-a", color: "black", value: 2 }],
      },
      pool: [{ id: "black-5-a", color: "black", value: 5 }],
      currentTurnPlayerId: ai1.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [ai1.id]: true,
        [ai2.id]: true,
      },
      aiScripts: {
        [ai1.id]: [
          { action: "playSets", sets: [meldSet] },
          { action: "endTurn" },
        ],
        [ai2.id]: [{ action: "fail", message: "Second AI failure" }],
      },
    });

    // Banner names only the failed AI
    await expect(
      page.getByText(`AI player stuck: ${ai2.name} — Second AI failure. Restart the server to recover.`)
    ).toBeVisible({ timeout: 10000 });

    // First AI's turn completed normally: board updated, turn stuck on the failed AI
    const stateAfter = await getGameStateFromServer(gameCode);
    expect(stateAfter.board).toHaveLength(1);
    expect(stateAfter.players[stateAfter.currentTurnIndex].id).toBe(ai2.id);

    await ctx.close();
  });
});

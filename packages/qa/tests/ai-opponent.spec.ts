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
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible();

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
    await expect(page.getByRole("button", { name: "Add" })).toBeDisabled();

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

  test("TC-AI-13: Debug console opens, shows rack + styled transcript, closes", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    // If Alice is first, draw so the AI takes a turn
    const yourTurnVisible = await page.getByText(/Your turn/i).first().isVisible().catch(() => false);
    if (yourTurnVisible) {
      await page.getByRole("button", { name: "Draw Tile" }).click();
    }
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Click the AI player in the top strip
    await page.getByTestId("ai-debug-player").click();

    const consolePanel = page.getByTestId("ai-debug-console");
    await expect(consolePanel).toBeVisible();

    // Anchored bottom right (fixed panel)
    await expect(consolePanel).toHaveClass(/fixed/);
    await expect(consolePanel).toHaveClass(/sm:right-4/);

    // Rack tiles are visible
    await expect(
      consolePanel.getByLabel(/^(red|blue|orange|black) \d+$|^Joker$/).first()
    ).toBeVisible();

    // Transcript contains at least one Prompt and one Tool call item
    const transcriptItems = consolePanel.locator("[data-item-type]");
    await expect(transcriptItems).not.toHaveCount(0);
    await expect(consolePanel.locator('[data-item-type="prompt"]').first()).toBeVisible();
    await expect(consolePanel.locator('[data-item-type="tool_call"]').first()).toBeVisible();
    await expect(consolePanel.locator('[data-item-type="tool_call"]').first()).toContainText(
      /Tool call: (play_sets|draw_tile|end_turn|pass_turn|get_game_state|manipulate_board|undo_turn)/
    );

    // Close button hides the console
    await consolePanel.getByRole("button", { name: "Close" }).click();
    await expect(consolePanel).toBeHidden();

    // Clicking the AI player again reopens it
    await page.getByTestId("ai-debug-player").click();
    await expect(consolePanel).toBeVisible();

    await ctx.close();
  });

  test("TC-AI-14: Transcript history scrolls back to the start of the round", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page);
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayer = gameState.players.find((p: { isAI?: boolean }) => p.isAI);

    const pool = Array.from({ length: 30 }, (_, i) => ({
      id: `blue-${i + 1}-a`,
      color: "blue",
      value: (i % 13) + 1,
    }));

    // Seeded drawTile script: the AI draws on every one of its turns
    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "red-1-a", color: "red", value: 1 }],
        [aiPlayer.id]: [{ id: "red-2-a", color: "red", value: 2 }],
      },
      pool,
      currentTurnPlayerId: aiPlayer.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [aiPlayer.id]: true,
      },
      aiScripts: {
        [aiPlayer.id]: [{ action: "drawTile" }],
      },
    });

    // AI turn 1 runs on seed; wait for Alice's turn
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Two more AI turns (turn 2 and turn 3)
    await page.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Open the console
    await page.getByTestId("ai-debug-player").click();
    const consolePanel = page.getByTestId("ai-debug-console");
    await expect(consolePanel).toBeVisible();

    const transcriptItems = consolePanel.locator("[data-item-type]");

    // Three AI turns: prompt + tool call per turn, in order
    await expect(transcriptItems).toHaveCount(6, { timeout: 10000 });
    const types = await transcriptItems.evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.itemType)
    );
    expect(types).toEqual(["prompt", "tool_call", "prompt", "tool_call", "prompt", "tool_call"]);

    const prompts = consolePanel.locator('[data-item-type="prompt"]');
    await expect(prompts.nth(0)).toContainText("Turn 1");
    await expect(prompts.nth(1)).toContainText("Turn 2");
    await expect(prompts.nth(2)).toContainText("Turn 3");

    const transcript = page.getByTestId("ai-debug-transcript");

    // The transcript overflows its container so scroll behaviour is meaningful
    const overflows = await transcript.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(overflows).toBe(true);

    // Auto-scroll: opening the console leaves the view pinned at the bottom
    const atBottom = await transcript.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
    expect(atBottom).toBe(true);

    // Scroll the transcript to the top: the first item of the round is the initial Prompt
    await transcript.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(transcriptItems.first()).toHaveAttribute("data-item-type", "prompt");
    await expect(transcriptItems.first()).toContainText("Turn 1");

    // Live items append while the console is open during a subsequent AI turn
    await page.getByRole("button", { name: "Draw Tile" }).click();
    await expect(transcriptItems).toHaveCount(8, { timeout: 10000 });
    await expect(transcriptItems.last()).toHaveAttribute("data-item-type", "tool_call");

    // Scroll pinning: the view stays where the user scrolled while live items arrive
    const pinnedScrollTop = await transcript.evaluate((el) => el.scrollTop);
    expect(pinnedScrollTop).toBe(0);

    await ctx.close();
  });

  test("TC-AI-15: Debug console switches between AI players", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page, undefined, "Bot One");
    await addAiPlayer(page, undefined, "Bot Two");
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

    // ai1 plays a meld and ends its turn; ai2 draws on its own turn
    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "blue-1-a", color: "blue", value: 1 }],
        // Extra tile so ai1 does not empty its rack and win the game
        [ai1.id]: [...meldSet.tiles, { id: "black-1-a", color: "black", value: 1 }],
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
        [ai2.id]: [{ action: "drawTile" }],
      },
    });

    // Both AI turns run; wait until the turn is back to Alice
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Open the console for the first AI: it shows ai1's own transcript
    await page.getByTestId("ai-debug-player").nth(0).click();
    const consolePanel = page.getByTestId("ai-debug-console");
    await expect(consolePanel).toBeVisible();
    await expect(consolePanel.getByText(ai1.name)).toBeVisible();
    await expect(consolePanel.locator('[data-item-type="tool_call"]').first()).toContainText("play_sets");

    // Switch to the second AI: the same console shows ai2's transcript, not ai1's
    await page.getByTestId("ai-debug-player").nth(1).click();
    await expect(consolePanel.getByText(ai2.name)).toBeVisible();
    await expect(consolePanel.locator('[data-item-type="tool_call"]').first()).toContainText("draw_tile");
    await expect(
      consolePanel.locator('[data-item-type="tool_call"]').filter({ hasText: "play_sets" })
    ).toHaveCount(0);

    await ctx.close();
  });

  test("TC-AI-16: Events note lists every opponent's activity since that AI's last turn", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const gameCode = await createGame(page, "Alice");
    await addAiPlayer(page, undefined, "Bot One");
    await addAiPlayer(page, undefined, "Bot Two");
    await startGameWithAi(page);

    const gameState = await getGameStateFromServer(gameCode);
    const humanPlayer = gameState.players.find((p: { isAI?: boolean }) => !p.isAI);
    const aiPlayers = gameState.players.filter((p: { isAI?: boolean }) => p.isAI);
    const ai1 = aiPlayers[0];
    const ai2 = aiPlayers[1];

    const pool = Array.from({ length: 12 }, (_, i) => ({
      id: `blue-${i + 1}-a`,
      color: "blue",
      value: (i % 13) + 1,
    }));

    // Turn order: Alice -> Bot One -> Bot Two. Both AIs draw on every turn.
    await seedGameServer(gameCode, {
      board: [],
      racks: {
        [humanPlayer.id]: [{ id: "red-1-a", color: "red", value: 1 }],
        [ai1.id]: [{ id: "black-1-a", color: "black", value: 1 }],
        [ai2.id]: [{ id: "black-2-a", color: "black", value: 2 }],
      },
      pool,
      currentTurnPlayerId: ai1.id,
      hasInitialMeld: {
        [humanPlayer.id]: true,
        [ai1.id]: true,
        [ai2.id]: true,
      },
      aiScripts: {
        [ai1.id]: [{ action: "drawTile" }],
        [ai2.id]: [{ action: "drawTile" }],
      },
    });

    // Seeding runs AI turns 1 (Bot One) and 2 (Bot Two); wait for Alice's turn
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Alice draws, which runs AI turns 3 (Bot One) and 4 (Bot Two)
    await page.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page.getByText(/Your turn/i).first()).toBeVisible({ timeout: 10000 });

    // Bot One's turn-3 prompt covers the full round since its turn 1
    await page.getByTestId("ai-debug-player").nth(0).click();
    const consolePanel = page.getByTestId("ai-debug-console");
    await expect(consolePanel).toBeVisible();
    await expect(consolePanel.getByText(ai1.name)).toBeVisible();
    const ai1Turn3Prompt = consolePanel.locator('[data-item-type="prompt"]').filter({ hasText: "Turn 3" });
    await expect(ai1Turn3Prompt).toContainText("Alice drew a tile");
    await expect(ai1Turn3Prompt).toContainText(`${ai2.name} drew a tile`);

    // Switch to Bot Two: its turn-4 prompt must also cover the whole round,
    // including Alice's draw — not just Bot One's activity
    await page.getByTestId("ai-debug-player").nth(1).click();
    await expect(consolePanel.getByText(ai2.name)).toBeVisible();
    const ai2Turn4Prompt = consolePanel.locator('[data-item-type="prompt"]').filter({ hasText: "Turn 4" });
    await expect(ai2Turn4Prompt).toContainText("Alice drew a tile");
    await expect(ai2Turn4Prompt).toContainText(`${ai1.name} drew a tile`);

    await ctx.close();
  });
});

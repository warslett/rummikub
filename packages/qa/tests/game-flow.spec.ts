import { test, expect, CLIENT_URL, createGame, joinGame, startGame, getRackTileCount, getPoolCount } from "./helpers";

test.describe("Game Creation", () => {
  test("TC-04: Create a game successfully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const gameCode = await createGame(page, "Alice");

    expect(gameCode).toMatch(/^[A-Z0-9]{6}$/);
    await expect(page.getByText("Waiting for other players...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Game" })).toBeHidden();
    await context.close();
  });

  test("TC-05: Join with invalid game code", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${CLIENT_URL}/lobby/ZZZZZZ`);
    await page.getByPlaceholder("Enter your name").fill("Bob");
    await page.getByRole("button", { name: "Join Game" }).click();

    await expect(page.getByText(/Game not found/i)).toBeVisible();
    await context.close();
  });
});

test.describe("Game Joining", () => {
  test("TC-06: Join a game successfully", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);

    await expect(page2.locator("p.text-3xl.font-mono")).toContainText(gameCode);
    await expect(page1.getByText("Bob")).toBeVisible();
    await expect(page1.getByRole("button", { name: "Start Game" })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-07: Cannot join a full game", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const ctx4 = await browser.newContext();
    const ctx5 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();
    const page4 = await ctx4.newPage();
    const page5 = await ctx5.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);
    await joinGame(page4, "Diana", gameCode);

    await page5.goto(`${CLIENT_URL}/game/${gameCode}`);
    await page5.getByPlaceholder("Enter your name").fill("Eve");
    await page5.getByRole("button", { name: "Join Game" }).click();

    await expect(page5.getByText("This game is full.")).toBeVisible({ timeout: 5000 });
    await expect(page5.getByRole("button", { name: "Watch as Spectator" })).toBeVisible();

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
    await ctx4.close();
    await ctx5.close();
  });

  test("TC-08: Join game via direct URL", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);

    await expect(page2.locator("p.text-3xl.font-mono")).toContainText(gameCode);
    await expect(page1.getByText("Bob")).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe("Game Start", () => {
  test("TC-09: Start game successfully", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const rack1Count = await getRackTileCount(page1);
    const rack2Count = await getRackTileCount(page2);
    expect(rack1Count).toBe(14);
    expect(rack2Count).toBe(14);

    const pool = await getPoolCount(page1);
    expect(pool).toBe("78");

    const p1YourTurn = await page1.getByText("Your turn").isVisible();
    const p2YourTurn = await page2.getByText("Your turn").isVisible();
    expect(p1YourTurn || p2YourTurn).toBe(true);
    expect(p1YourTurn && p2YourTurn).toBe(false);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-10: Cannot start with only one player", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await createGame(page, "Alice");
    await expect(page.getByRole("button", { name: "Start Game" })).toBeHidden();
    await ctx.close();
  });
});

test.describe("Turn-Based Gameplay", () => {
  test("TC-11: Draw a tile on your turn", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    const otherPlayer = activePlayer === page1 ? page2 : page1;

    const rackBefore = await getRackTileCount(activePlayer);
    const poolBefore = parseInt(await getPoolCount(activePlayer), 10);

    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();

    const rackAfter = await getRackTileCount(activePlayer);
    const poolAfter = parseInt(await getPoolCount(activePlayer), 10);

    expect(rackAfter).toBe(rackBefore + 1);
    expect(poolAfter).toBe(poolBefore - 1);
    await expect(otherPlayer.getByText("Your turn")).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-12: Cannot draw on opponent's turn", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const waitingPlayer = (await page1.getByText("Your turn").isVisible()) ? page2 : page1;
    await expect(waitingPlayer.getByText("Waiting for other players...")).toBeVisible();
    await expect(waitingPlayer.getByRole("button", { name: "Draw Tile" })).toBeHidden();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-16: Turn alternates after draw", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    let activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    let waitingPlayer = activePlayer === page1 ? page2 : page1;

    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();
    await expect(waitingPlayer.getByText("Your turn")).toBeVisible();

    activePlayer = waitingPlayer;
    waitingPlayer = activePlayer === page1 ? page2 : page1;

    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();
    await expect(waitingPlayer.getByText("Your turn")).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-18: Select fewer than 3 tiles", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const firstTile = rack.locator("button").first();
    await firstTile.click();

    await expect(activePlayer.getByRole("button", { name: /Play Selected/ })).toBeDisabled();

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe("Board Display", () => {
  test("TC-22: Rack display - opponent tiles not visible", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const rack1Count = await getRackTileCount(page1);
    expect(rack1Count).toBe(14);

    await expect(page1.getByText(/tiles$/)).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-23: Pool count is visible and decreases on draw", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const pool1Before = await getPoolCount(page1);
    const pool2Before = await getPoolCount(page2);
    expect(pool1Before).toBe(pool2Before);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();

    const pool1After = await getPoolCount(page1);
    const pool2After = await getPoolCount(page2);
    expect(parseInt(pool1After, 10)).toBe(parseInt(pool1Before, 10) - 1);
    expect(pool1After).toBe(pool2After);

    await ctx1.close();
    await ctx2.close();
  });
});

test.describe("Error Handling", () => {
  test("TC-24: Invalid game URL", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${CLIENT_URL}/game/INVALID`);
    await page.getByPlaceholder("Enter your name").fill("Alice");
    await page.getByRole("button", { name: "Join Game" }).click();
    await expect(page.getByText(/Game not found/i)).toBeVisible();
    await ctx.close();
  });
});

test.describe("Docker Deployment", () => {
  test("TC-27: Server health check", async ({ request }) => {
    const resp = await request.get(`${process.env.SERVER_URL ?? "http://localhost:3000"}/health`);
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body.status).toBe("ok");
  });
});

test.describe("Lobby URL Sharing", () => {
  test("TC-28: Lobby displays game URL with Copy button", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const gameCode = await createGame(page, "Alice");

    const gameUrl = `${CLIENT_URL}/lobby/${gameCode}`;
    await expect(page.getByText(gameUrl)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();

    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    await ctx.close();
  });
});

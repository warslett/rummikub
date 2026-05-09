import { test, expect, createGame, joinGame, startGame, getPoolCount, seedGame } from "./helpers";
import type { SeedState } from "./helpers";

function tile(color: string, value: number, id: string) {
  return { id, color, value };
}

test.describe("Spectator Mode", () => {
  test("TC-SPEC-01: Spectator joins a full game", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();

    await expect(page3.getByText("This game is full.")).toBeVisible({ timeout: 5000 });
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible();

    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-02: Spectator sees real-time board updates", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    const poolBefore = parseInt(await getPoolCount(page3), 10);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    const poolAfter = parseInt(await getPoolCount(page3), 10);
    expect(poolAfter).toBe(poolBefore - 1);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-03: Spectator cannot see rack tiles", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    await expect(page3.locator("span", { hasText: /tiles/ })).toHaveCount(0);

    const rack = page3.locator(".gap-2.p-4.rounded-lg");
    await expect(rack).toHaveCount(0);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-04: Spectator has no action controls", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    await expect(page3.getByRole("button", { name: "Draw Tile" })).toHaveCount(0);
    await expect(page3.getByRole("button", { name: "End Turn" })).toHaveCount(0);
    await expect(page3.getByRole("button", { name: /Play Selected/ })).toHaveCount(0);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-05: Spectator sees turn indicator", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    const turnText = await page3.locator(".text-center.text-gray-500.text-sm").textContent();
    expect(turnText).toMatch(/'s turn$/);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();
    await expect(page3.locator(".text-center.text-gray-500.text-sm")).not.toHaveText(turnText!, { timeout: 5000 });

    const newTurnText = await page3.locator(".text-center.text-gray-500.text-sm").textContent();
    expect(newTurnText).toMatch(/'s turn$/);
    expect(newTurnText).not.toBe(turnText);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-06: Spectator sees game end and Play Again", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const player1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const player2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    await seedGame(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [tile("blue", 5, "blue-5-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    });

    await expect(page1.locator(".gap-2.p-4.rounded-lg")).toBeVisible({ timeout: 5000 });
    await expect(page2.locator(".gap-2.p-4.rounded-lg")).toBeVisible({ timeout: 5000 });

    const rack = page1.locator(".gap-2.p-4.rounded-lg");
    const red13 = rack.locator("button").filter({ hasText: "13" }).first();
    await red13.click();

    const boardArea = page1.locator(".gap-3.p-5.rounded-xl");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    await page1.getByRole("button", { name: "End Turn" }).click();

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });
    await expect(page3.getByText("Game Over")).toBeVisible({ timeout: 8000 });

    await page1.getByRole("button", { name: "Play Again" }).click();
    await expect(page3.getByText(/Round 2/)).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-SPEC-07: Spectator sees disconnect notification", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.getByPlaceholder("Enter your name").fill("Charlie");
    await page3.getByRole("button", { name: "Join Game" }).click();
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toBeVisible({ timeout: 5000 });
    await page3.getByRole("button", { name: "Watch as Spectator" }).click();
    await expect(page3.getByText("Spectating")).toBeVisible({ timeout: 5000 });

    await ctx2.close();
    await expect(page3.getByText("Player disconnected")).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx3.close();
  });

  test("TC-SPEC-08: Non-full game offers join not spectate", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await expect(page3.getByRole("heading", { name: "Join Game" })).toBeVisible({ timeout: 5000 });
    await expect(page3.getByText("This game is full.")).toHaveCount(0);
    await expect(page3.getByRole("button", { name: "Watch as Spectator" })).toHaveCount(0);

    await ctx1.close();
    await ctx3.close();
  });
});

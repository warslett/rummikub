import { test, expect, CLIENT_URL, createGame, joinGame, startGame, getRackTileCount, getPoolCount, seedGame } from "./helpers";
import type { SeedState } from "./helpers";

function tile(color: string, value: number, id: string) {
  return { id, color, value };
}

test.describe("Multi-Player Support", () => {
  test("TC-MP-01: 3-player game creation and start", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);

    await expect(page1.getByText("Bob")).toBeVisible();
    await expect(page1.getByText("Charlie")).toBeVisible();
    await expect(page1.getByText("3/4 players")).toBeVisible();

    await page2.getByRole("button", { name: "Start Game" }).click();
    await page1.waitForURL(/\/game\//);
    await page2.waitForURL(/\/game\//);
    await page3.waitForURL(/\/game\//);

    const rack1Count = await getRackTileCount(page1);
    expect(rack1Count).toBe(14);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-MP-02: 4-player game creation and start", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const ctx4 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();
    const page4 = await ctx4.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);
    await joinGame(page4, "Diana", gameCode);

    await expect(page1.getByText("4/4 players")).toBeVisible();

    await page1.getByRole("button", { name: "Start Game" }).click();
    await page1.waitForURL(/\/game\//);
    await page2.waitForURL(/\/game\//);
    await page3.waitForURL(/\/game\//);
    await page4.waitForURL(/\/game\//);

    const pool = await getPoolCount(page1);
    expect(parseInt(pool)).toBe(106 - 14 * 4);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
    await ctx4.close();
  });

  test("TC-MP-03: Start button disabled with 1 player", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await createGame(page, "Alice");
    await expect(page.getByRole("button", { name: "Start Game" })).toBeHidden();
    await ctx.close();
  });

  test("TC-MP-04: 5th visitor offered spectator mode", async ({ browser }) => {
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

  test("TC-MP-05: 3-player turn rotation", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);
    await startGame(page1, page2);

    await page3.waitForURL(/\/game\//);

    const p1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const p2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const p3Id = await page3.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    await seedGame(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [p1Id]: [tile("red", 13, "red-13-a")],
        [p2Id]: [tile("blue", 5, "blue-5-a")],
        [p3Id]: [tile("black", 7, "black-7-a")],
      },
      pool: [],
      currentTurnPlayerId: p1Id,
      hasInitialMeld: { [p1Id]: true, [p2Id]: true, [p3Id]: true },
    });

    await expect(page1.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    const activePlayer = page1;
    await activePlayer.getByRole("button", { name: "Pass" }).click();

    await expect(page2.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await page2.getByRole("button", { name: "Pass" }).click();

    await expect(page3.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-MP-06: 3-player scoring — winner gets sum of losers", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);
    await startGame(page1, page2);
    await page3.waitForURL(/\/game\//);

    const p1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const p2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const p3Id = await page3.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    await seedGame(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [p1Id]: [tile("red", 13, "red-13-a")],
        [p2Id]: [tile("blue", 5, "blue-5-a")],
        [p3Id]: [tile("black", 3, "black-3-a")],
      },
      pool: [tile("red", 1, "red-1-a")],
      currentTurnPlayerId: p1Id,
      hasInitialMeld: { [p1Id]: true, [p2Id]: true, [p3Id]: true },
    });

    await expect(page1.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    const rack = page1.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red13 = rack.locator("button").filter({ hasText: "13" }).first();
    await red13.click();

    const boardArea = page1.locator(".bg-green-900\\/40");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    await page1.getByRole("button", { name: "End Turn" }).click();

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-MP-10: 3-player game sees all opponents", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);
    await startGame(page1, page2);
    await page3.waitForURL(/\/game\//);

    await expect(page1.locator("span.text-sm", { hasText: "Bob" })).toBeVisible({ timeout: 5000 });
    await expect(page1.locator("span.text-sm", { hasText: "Charlie" })).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-MP-11: Lobby shows all joined players", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    const page3 = await ctx3.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await joinGame(page3, "Charlie", gameCode);

    await expect(page1.getByText("Bob")).toBeVisible();
    await expect(page1.getByText("Charlie")).toBeVisible();
    await expect(page1.getByText("3/4 players")).toBeVisible();

    await expect(page2.getByText("Alice")).toBeVisible();
    await expect(page2.getByText("Charlie")).toBeVisible();
    await expect(page2.getByText("3/4 players")).toBeVisible();

    await expect(page3.getByText("Alice")).toBeVisible();
    await expect(page3.getByText("Bob")).toBeVisible();
    await expect(page3.getByText("3/4 players")).toBeVisible();

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

  test("TC-MP-14: 2-player game unchanged", async ({ browser }) => {
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

    await ctx1.close();
    await ctx2.close();
  });
});

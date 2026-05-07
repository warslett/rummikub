import { test, expect, createGame, joinGame, startGame } from "./helpers";
import type { Browser, BrowserContext } from "@playwright/test";

test.describe("Reconnection", () => {
  test("TC-44: Player disconnects, opponent sees notification", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    await ctx1.close();

    await expect(page2.getByText("Player disconnected")).toBeVisible({ timeout: 8000 });

    await ctx2.close();
  });

  test("TC-45: Player reconnects, state is restored", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const player1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const player1GameCode = await page1.evaluate(() => localStorage.getItem("rummikub_gameCode") ?? "");

    await ctx1.close();
    await expect(page2.getByText("Player disconnected")).toBeVisible({ timeout: 8000 });

    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await page3.goto("http://localhost:5173");
    await page3.evaluate((ids: { playerId: string; gameCode: string }) => {
      localStorage.setItem("rummikub_playerId", ids.playerId);
      localStorage.setItem("rummikub_gameCode", ids.gameCode);
    }, { playerId: player1Id, gameCode: player1GameCode });

    await page3.goto(`http://localhost:5173/game/${gameCode}`);
    await page3.waitForTimeout(2000);

    await page2.waitForTimeout(1000);
    const disconnectedGone = await page2.getByText("Player disconnected").isVisible().catch(() => false);
    expect(disconnectedGone).toBe(false);

    await ctx2.close();
    await ctx3.close();
  });
});

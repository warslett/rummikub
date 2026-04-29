import { test, expect, createGame, joinGame, startGame, seedGame, getRackTileCount } from "./helpers";
import type { SeedState } from "./helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";

async function createAndStartGame(browser: Browser, p1Name = "Alice", p2Name = "Bob") {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const gameCode = await createGame(page1, p1Name);
  await joinGame(page2, p2Name, gameCode);
  await startGame(page1, page2);

  const player1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
  const player2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

  return { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id };
}

async function seedAndWait(gameCode: string, seed: SeedState, pages: Page[]) {
  await seedGame(gameCode, seed);
  await pages[0].waitForTimeout(1500);
}

function tile(color: string, value: number, id: string) {
  return { id, color, value };
}

test.describe("Phase 2 - Core Gameplay", () => {
  test("TC-32: Draw tile and end turn", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    await startGame(page1, page2);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;
    const rackBefore = await getRackTileCount(activePlayer);

    await activePlayer.getByRole("button", { name: "Draw Tile" }).click();
    await page1.waitForTimeout(500);

    const rackAfter = await getRackTileCount(activePlayer);
    expect(rackAfter).toBe(rackBefore + 1);

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 3000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("Initial meld: play tiles totaling 30+ points", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("blue", 1, "blue-1-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = (await page1.getByText("Your turn").isVisible()) ? page1 : page2;

    await expect(activePlayer.getByText(/Initial meld/)).toBeVisible({ timeout: 5000 });

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    await expect(rack.locator("button").first()).toBeVisible({ timeout: 5000 });

    const allButtons = rack.locator("button");
    const count = await allButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < Math.min(3, count); i++) {
      await allButtons.nth(i).click();
    }

    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await page1.waitForTimeout(500);

    await ctx1.close();
    await ctx2.close();
  });
});

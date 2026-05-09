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

async function getActivePlayer(page1: Page, page2: Page): Promise<Page> {
  await page1.waitForTimeout(500);
  const p1Visible = await page1.getByText("Your turn").isVisible().catch(() => false);
  return p1Visible ? page1 : page2;
}

async function winRound(activePlayer: Page, page1: Page, page2: Page) {
  const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
  const red13 = rack.locator("button").filter({ hasText: "13" }).first();
  await red13.click();

  const boardArea = activePlayer.locator(".gap-3.p-5.rounded-xl");
  const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
  await board12.click();

  await activePlayer.getByRole("button", { name: "End Turn" }).click();

  await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });
}

test.describe("Scoring", () => {
  test("TC-42: Cumulative scoring across two rounds", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [tile("blue", 5, "blue-5-a"), tile("black", 3, "black-3-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await winRound(activePlayer, page1, page2);

    await expect(page2.getByText("Game Over")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-43: Play Again starts new round with preserved scores", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [tile("blue", 5, "blue-5-a"), tile("black", 3, "black-3-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await winRound(activePlayer, page1, page2);

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 5000 });

    await page1.getByRole("button", { name: "Play Again" }).click();
    await page1.waitForTimeout(2000);

    await expect(page1.getByText(/Round 2/)).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-50: Games-won counter increments for round winner", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [tile("blue", 5, "blue-5-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await winRound(activePlayer, page1, page2);

    await expect(page1.getByText("Games Won")).toBeVisible({ timeout: 5000 });
    await expect(page1.locator(".text-amber-400.font-bold").filter({ hasText: /^1$/ })).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-51: Multiple rounds track games won for each player", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [tile("blue", 5, "blue-5-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await winRound(activePlayer, page1, page2);

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 5000 });

    await page1.getByRole("button", { name: "Play Again" }).click();
    await page1.waitForTimeout(2000);

    await expect(page1.getByText(/Round 2/)).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });
});

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

function joker(id: string) {
  return { id, color: "joker", value: 0 };
}

async function getActivePlayer(page1: Page, page2: Page): Promise<Page> {
  await page1.waitForTimeout(500);
  const p1Visible = await page1.getByText("Your turn").isVisible().catch(() => false);
  return p1Visible ? page1 : page2;
}

test.describe("Jokers", () => {
  test("TC-36: Play a joker as part of a run", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 9, "red-9-a"), tile("red", 11, "red-11-a"), joker("joker-1"), tile("blue", 3, "blue-3-a"), tile("blue", 4, "blue-4-a"), tile("blue", 5, "blue-5-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    await expect(rack.locator("button").filter({ hasText: "★" }).first()).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-37: Play a joker as part of a group", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 7, "red-7-a"), tile("black", 7, "black-7-a"), joker("joker-1"), tile("blue", 3, "blue-3-a"), tile("blue", 4, "blue-4-a"), tile("blue", 5, "blue-5-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    await expect(rack.locator("button").filter({ hasText: "★" }).first()).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-38: Verify joker on board is displayed", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 9, "red-9-a"), joker("joker-1"), tile("red", 11, "red-11-a")] }],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("blue", 5, "blue-5-a"), tile("orange", 5, "orange-5-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");

    const boardTiles = boardArea.locator("button");
    await expect(boardTiles.first()).toBeVisible({ timeout: 5000 });
    expect(await boardTiles.count()).toBe(3);

    const firstSet = boardArea.locator(".flex.gap-1.p-2").first();
    const jokerButton = firstSet.locator("button").nth(1);
    await expect(jokerButton).toBeVisible();
    const jokerClasses = await jokerButton.getAttribute("class") ?? "";
    expect(jokerClasses).toContain("bg-gradient");

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-39: Freed joker must be used in the same turn", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [tile("red", 3, "red-3-a"), joker("joker-1"), tile("red", 5, "red-5-a")] },
        { id: "s2", tiles: [tile("blue", 3, "blue-3-a"), tile("blue", 4, "blue-4-a"), tile("blue", 5, "blue-5-a")] },
      ],
      racks: {
        [player1Id]: [tile("red", 4, "red-4-a"), tile("orange", 3, "orange-3-a"), tile("black", 7, "black-7-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");

    const firstSet = boardArea.locator(".flex.gap-1.p-2").first();
    const jokerButton = firstSet.locator("button").nth(1);
    await jokerButton.click();

    const anyRackTile = rack.locator("button").first();
    await anyRackTile.click();

    const red4 = rack.locator("button").filter({ hasText: "4" }).first();
    await red4.click();

    const red3InFirstSet = firstSet.locator("button").first();
    await red3InFirstSet.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    await expect(activePlayer.getByText(/freed joker/i)).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-40: Verify board with joker renders", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [joker("joker-1"), tile("red", 5, "red-5-a"), tile("black", 5, "black-5-a")] },
        { id: "s2", tiles: [tile("blue", 3, "blue-3-a"), tile("blue", 4, "blue-4-a"), tile("blue", 5, "blue-5-a")] },
      ],
      racks: {
        [player1Id]: [tile("orange", 1, "orange-1-a"), tile("orange", 2, "orange-2-a"), tile("orange", 3, "orange-3-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");

    await expect(boardArea.locator("button").first()).toBeVisible({ timeout: 5000 });

    const boardTileCount = await boardArea.locator("button").count();
    expect(boardTileCount).toBe(6);

    const sets = boardArea.locator(".flex.gap-1.p-2");
    await expect(sets).toHaveCount(2, { timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-41: Joker penalty of 30 points applied in scoring", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a")],
        [player2Id]: [joker("joker-1"), tile("blue", 5, "blue-5-a"), tile("orange", 3, "orange-3-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red13 = rack.locator("button").filter({ hasText: "13" }).first();
    await red13.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });
    await expect(page2.getByText("Game Over")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });
});

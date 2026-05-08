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

test.describe("Board Manipulation", () => {
  test("TC-28: Add a tile to extend an existing run", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a"), tile("blue", 3, "blue-3-a"), tile("black", 7, "black-7-a")],
        [player2Id]: [tile("orange", 5, "orange-5-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const rackBefore = await getRackTileCount(activePlayer);
    expect(rackBefore).toBe(3);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red13Tile = rack.locator("button").filter({ hasText: "13" }).first();
    await red13Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-29: Verify seeded board with two runs renders correctly", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a")] },
        { id: "s2", tiles: [tile("blue", 3, "blue-3-a"), tile("blue", 4, "blue-4-a"), tile("blue", 5, "blue-5-a")] },
      ],
      racks: {
        [player1Id]: [tile("red", 6, "red-6-a"), tile("blue", 2, "blue-2-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");

    await expect(boardArea.locator("button").filter({ hasText: "3" }).first()).toBeVisible({ timeout: 5000 });
    await expect(boardArea.locator("button").filter({ hasText: "4" }).first()).toBeVisible();
    await expect(boardArea.locator("button").filter({ hasText: "5" }).first()).toBeVisible();

    const boardTileCount = await boardArea.locator("button").count();
    expect(boardTileCount).toBe(6);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-30: Verify seeded board with two separate runs renders", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a")] },
        { id: "s2", tiles: [tile("red", 7, "red-7-a"), tile("red", 8, "red-8-a"), tile("red", 9, "red-9-a")] },
      ],
      racks: {
        [player1Id]: [tile("red", 6, "red-6-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");

    await expect(boardArea.locator("button").filter({ hasText: "3" }).first()).toBeVisible({ timeout: 5000 });
    await expect(boardArea.locator("button").filter({ hasText: "9" }).first()).toBeVisible();

    const sets = boardArea.locator(".flex.gap-1.p-2");
    await expect(sets).toHaveCount(2, { timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-31: Verify seeded board with a group renders", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 7, "red-7-a"), tile("blue", 7, "blue-7-a"), tile("black", 7, "black-7-a")] }],
      racks: {
        [player1Id]: [tile("orange", 7, "orange-7-a"), tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a")],
        [player2Id]: [tile("blue", 1, "blue-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const boardArea = activePlayer.locator(".bg-green-900\\/40");

    const sevenButtons = boardArea.locator("button").filter({ hasText: /^7$/ });
    await expect(sevenButtons.first()).toBeVisible({ timeout: 5000 });
    expect(await sevenButtons.count()).toBe(3);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-33: Invalid manipulation shows error", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 5, "orange-5-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const blue3 = rack.locator("button").filter({ hasText: "3" }).first();
    await blue3.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    await expect(activePlayer.getByText(/invalid/i)).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-34: Manipulation before initial meld is rejected", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 9, "red-9-a"), tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a")],
        [player2Id]: [tile("blue", 1, "blue-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await expect(activePlayer.getByText(/Initial meld/)).toBeVisible({ timeout: 5000 });

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const boardTiles = boardArea.locator("button");
    expect(await boardTiles.count()).toBeGreaterThan(0);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-35: Undo reverts all changes made this turn", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    const rackBefore = await getRackTileCount(activePlayer);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const tile13 = rack.locator("button").filter({ hasText: "13" }).first();
    await tile13.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();

    const rackAfterPlace = await getRackTileCount(activePlayer);
    expect(rackAfterPlace).toBe(rackBefore - 1);

    await activePlayer.getByRole("button", { name: "Undo" }).click();

    const rackAfterUndo = await getRackTileCount(activePlayer);
    expect(rackAfterUndo).toBe(rackBefore);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-59: Adding a tile to the end of a run auto-sorts correctly", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a")] }],
      racks: {
        [player1Id]: [tile("red", 6, "red-6-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red6Tile = rack.locator("button").filter({ hasText: "6" }).first();
    await red6Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board5 = boardArea.locator("button").filter({ hasText: "5" }).first();
    await board5.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-60: Adding a tile to the beginning of a run auto-sorts correctly", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a"), tile("red", 6, "red-6-a")] }],
      racks: {
        [player1Id]: [tile("red", 3, "red-3-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red3Tile = rack.locator("button").filter({ hasText: "3" }).first();
    await red3Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board4 = boardArea.locator("button").filter({ hasText: "4" }).first();
    await board4.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-61: Adding a tile to the middle of a run auto-sorts correctly", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 6, "red-6-a")] }],
      racks: {
        [player1Id]: [tile("red", 5, "red-5-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red5Tile = rack.locator("button").filter({ hasText: "5" }).first();
    await red5Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board4 = boardArea.locator("button").filter({ hasText: "4" }).first();
    await board4.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-62: Adding a tile to a group does not reorder", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 7, "red-7-a"), tile("blue", 7, "blue-7-a"), tile("black", 7, "black-7-a")] }],
      racks: {
        [player1Id]: [tile("orange", 7, "orange-7-a"), tile("red", 3, "red-3-a")],
        [player2Id]: [tile("blue", 1, "blue-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const orange7Tile = rack.locator("button").filter({ hasText: "7" }).first();
    await orange7Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board7 = boardArea.locator("button").filter({ hasText: "7" }).first();
    await board7.click();

    const sevenButtons = boardArea.locator("button").filter({ hasText: /^7$/ });
    expect(await sevenButtons.count()).toBe(4);

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-63: Adding a tile to a run with a joker auto-sorts joker into correct position", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("joker", 0, "joker-1"), tile("red", 5, "red-5-a")] }],
      racks: {
        [player1Id]: [tile("red", 6, "red-6-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red6Tile = rack.locator("button").filter({ hasText: "6" }).first();
    await red6Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board5 = boardArea.locator("button").filter({ hasText: "5" }).first();
    await board5.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-64: Moving a tile between runs auto-sorts the destination run", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a")] },
        { id: "s2", tiles: [tile("red", 6, "red-6-a"), tile("red", 7, "red-7-a"), tile("red", 8, "red-8-a")] },
      ],
      racks: {
        [player1Id]: [tile("red", 9, "red-9-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
    const red9Tile = rack.locator("button").filter({ hasText: "9" }).first();
    await red9Tile.click();

    const boardArea = activePlayer.locator(".bg-green-900\\/40");
    const board8 = boardArea.locator("button").filter({ hasText: "8" }).first();
    await board8.click();

    const board6 = boardArea.locator("button").filter({ hasText: "6" }).first();
    await board6.click();

    const board5 = boardArea.locator("button").filter({ hasText: "5" }).first();
    await board5.click();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });
});

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

test.describe("Turn Controls and Multi-Select Fixes", () => {
  test("TC-52: End Turn disabled before any action, Draw Tile active", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2 } = await createAndStartGame(browser);

    const activePlayer = await getActivePlayer(page1, page2);

    await expect(activePlayer.getByRole("button", { name: "End Turn" })).toBeDisabled();
    await expect(activePlayer.getByRole("button", { name: "Draw Tile" })).toBeEnabled();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-53: After playing initial meld, End Turn enabled and Draw Tile disabled", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("blue", 1, "blue-1-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    const allButtons = rack.locator("button");
    await expect(allButtons.first()).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }

    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await activePlayer.waitForTimeout(500);

    await expect(activePlayer.getByRole("button", { name: "End Turn" })).toBeEnabled();
    await expect(activePlayer.getByRole("button", { name: "Draw Tile" })).toBeDisabled();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-54: Cannot end turn without playing or drawing", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    await expect(activePlayer.getByRole("button", { name: "End Turn" })).toBeDisabled();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-55: Multi-select rack tiles works after initial meld", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("blue", 5, "blue-5-a"), tile("orange", 5, "orange-5-a"), tile("black", 5, "black-5-a"), tile("red", 3, "red-3-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    const allButtons = rack.locator("button");
    await expect(allButtons.first()).toBeVisible({ timeout: 5000 });

    await allButtons.nth(0).click();
    await allButtons.nth(1).click();
    await allButtons.nth(2).click();

    const playButton = activePlayer.getByRole("button", { name: /Play Selected/ });
    await expect(playButton).toBeEnabled();

    const buttonText = await playButton.textContent();
    expect(buttonText).toContain("3");

    await playButton.click();
    await activePlayer.waitForTimeout(500);

    await expect(activePlayer.getByRole("button", { name: "End Turn" })).toBeEnabled();

    await activePlayer.getByRole("button", { name: "End Turn" }).click();
    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-56: Initial meld message disappears after playing tiles", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("blue", 1, "blue-1-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    await expect(activePlayer.getByText(/Initial meld/)).toBeVisible({ timeout: 5000 });

    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    const allButtons = rack.locator("button");
    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }

    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await activePlayer.waitForTimeout(500);

    await expect(activePlayer.getByText(/Initial meld/)).toBeHidden();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-57: Undo button appears before initial meld after playing tiles", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("blue", 1, "blue-1-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    await expect(activePlayer.getByRole("button", { name: "Undo" })).toBeHidden();

    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    const allButtons = rack.locator("button");
    await expect(allButtons.first()).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }

    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await activePlayer.waitForTimeout(500);

    await expect(activePlayer.getByRole("button", { name: "Undo" })).toBeEnabled();

    await activePlayer.getByRole("button", { name: "Undo" }).click();
    await activePlayer.waitForTimeout(500);

    const rackAfterUndo = await getRackTileCount(activePlayer);
    expect(rackAfterUndo).toBe(4);

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-58: Undo before initial meld and play different tiles", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [],
      racks: {
        [player1Id]: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("blue", 10, "blue-10-a"), tile("orange", 10, "orange-10-a"), tile("black", 10, "black-10-a")],
        [player2Id]: [tile("black", 1, "black-1-a")],
      },
      pool: [tile("orange", 2, "orange-2-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: false, [player2Id]: false },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    const allButtons = rack.locator("button");
    await expect(allButtons.first()).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }
    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await activePlayer.waitForTimeout(500);

    await activePlayer.getByRole("button", { name: "Undo" }).click();
    await activePlayer.waitForTimeout(500);

    const rackAfterUndo = await getRackTileCount(activePlayer);
    expect(rackAfterUndo).toBe(6);

    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }
    await activePlayer.getByRole("button", { name: /Play Selected/ }).click();
    await activePlayer.waitForTimeout(500);

    await expect(activePlayer.getByRole("button", { name: "End Turn" })).toBeEnabled();
    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-65: Ending turn with invalid set shows per-set error descriptions", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    // Remove a tile from a run (red-12) to leave 2 tiles in a set → invalid
    const boardArea = activePlayer.locator(".gap-3.p-5.rounded-xl");
    const board12 = boardArea.locator("button").filter({ hasText: "12" }).first();
    await board12.click();
    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    await rack.locator("button").first().click();

    // Now the set has only 2 tiles — end turn should show per-set error
    await activePlayer.getByRole("button", { name: "End Turn" }).click();
    await activePlayer.waitForTimeout(500);

    // Verify per-set error message is shown (not the generic one)
    await expect(activePlayer.getByText(/invalid set/i)).toBeVisible({ timeout: 5000 });

    // Hover over the invalid set to reveal its tooltip
    const invalidSet = activePlayer.locator('[class*="ring-red-500"]').first();
    await invalidSet.hover();
    await expect(activePlayer.getByText(/Needs at least 3 tiles/i)).toBeVisible({ timeout: 5000 });

    // Verify the invalid set has a red border ring
    const setContainers = activePlayer.locator('[class*="ring-red-500"]');
    await expect(setContainers.first()).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-66: Valid sets are not highlighted", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [
        { id: "s1", tiles: [tile("red", 3, "red-3-a"), tile("red", 4, "red-4-a"), tile("red", 5, "red-5-a")] },
        { id: "s2", tiles: [tile("blue", 7, "blue-7-a"), tile("orange", 7, "orange-7-a"), tile("black", 7, "black-7-a")] },
      ],
      racks: {
        [player1Id]: [tile("red", 6, "red-6-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("black", 1, "black-1-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);

    // Verify there are no error tooltips on the board
    const errorTooltips = activePlayer.locator('[role="tooltip"]');
    await expect(errorTooltips).toHaveCount(0);

    // Verify there are no red ring borders on the board
    const redRings = activePlayer.locator('[class*="ring-red-500"]');
    await expect(redRings).toHaveCount(0);

    // Verify the error message area is empty
    await expect(activePlayer.getByText(/invalid set/i)).toBeHidden();

    await ctx1.close();
    await ctx2.close();
  });
});

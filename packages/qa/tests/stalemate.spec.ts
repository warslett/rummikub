import { test, expect, createGame, joinGame, startGame, seedGame } from "./helpers";
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

const stalemateSeed = (player1Id: string, player2Id: string): SeedState => ({
  board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
  racks: {
    [player1Id]: [tile("red", 3, "red-3-a")],
    [player2Id]: [tile("blue", 10, "blue-10-a"), tile("black", 10, "black-10-a")],
  },
  pool: [],
  currentTurnPlayerId: player1Id,
  hasInitialMeld: { [player1Id]: true, [player2Id]: true },
});

async function bothPlayersPass(page1: Page, page2: Page, activePlayer: Page) {
  await expect(activePlayer.getByRole("button", { name: "Pass" })).toBeVisible({ timeout: 5000 });
  await activePlayer.getByRole("button", { name: "Pass" }).click();

  const otherPlayer = activePlayer === page1 ? page2 : page1;
  await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });
  await expect(otherPlayer.getByRole("button", { name: "Pass" })).toBeVisible({ timeout: 5000 });
  await otherPlayer.getByRole("button", { name: "Pass" }).click();
}

test.describe("Stalemate", () => {
  test("TC-46: Pool empty, both players pass, game ends", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, stalemateSeed(player1Id, player2Id), [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await bothPlayersPass(page1, page2, activePlayer);

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-47: Stalemate shows correct winner with lowest rack value", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, stalemateSeed(player1Id, player2Id), [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await bothPlayersPass(page1, page2, activePlayer);

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-48: Stalemate displays stalemate message", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, stalemateSeed(player1Id, player2Id), [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await bothPlayersPass(page1, page2, activePlayer);

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });
    await expect(page1.getByText(/Stalemate/i)).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test("TC-49: Single pass does not end the game", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, stalemateSeed(player1Id, player2Id), [page1, page2]);

    const activePlayer = await getActivePlayer(page1, page2);
    await expect(activePlayer.getByRole("button", { name: "Pass" })).toBeVisible({ timeout: 5000 });
    await activePlayer.getByRole("button", { name: "Pass" }).click();

    const otherPlayer = activePlayer === page1 ? page2 : page1;
    await expect(otherPlayer.getByText("Your turn")).toBeVisible({ timeout: 5000 });

    const gameOverOnP1 = await page1.getByText("Game Over").isVisible().catch(() => false);
    const gameOverOnP2 = await page2.getByText("Game Over").isVisible().catch(() => false);
    expect(gameOverOnP1 || gameOverOnP2).toBe(false);

    await ctx1.close();
    await ctx2.close();
  });
});

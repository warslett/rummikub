import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

type PlayerFixture = {
  browser: Browser;
};

export const test = base.extend<PlayerFixture>({});

export const CLIENT_URL = process.env.BASE_URL ?? "http://localhost:5173";
export const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

export async function createPlayerContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext();
}

export async function createGame(page: import("@playwright/test").Page, playerName: string): Promise<string> {
  await page.goto(CLIENT_URL);
  await page.getByPlaceholder("Enter your name").fill(playerName);
  await page.getByRole("button", { name: "Create Game" }).click();
  await page.waitForURL(/\/lobby\//);
  const url = page.url();
  const match = url.match(/\/lobby\/([A-Z0-9]+)$/);
  expect(match).toBeTruthy();
  return match![1];
}

export async function joinGame(page: import("@playwright/test").Page, playerName: string, gameCode: string) {
  await page.goto(`${CLIENT_URL}/lobby/${gameCode}`);
  await page.getByPlaceholder("Enter your name").fill(playerName);
  await page.getByRole("button", { name: "Join Game" }).click();
  await page.waitForURL(/\/lobby\//);
}

export async function startGame(player1Page: import("@playwright/test").Page, player2Page: import("@playwright/test").Page) {
  await player1Page.getByRole("button", { name: "Start Game" }).click();
  await player1Page.waitForURL(/\/game\//);
  await player2Page.waitForURL(/\/game\//);
  // Wait for game state to fully load on both pages (Socket.IO state arrives async after navigation)
  await expect(player1Page.getByText(/Pool:/)).toBeVisible();
  await expect(player2Page.getByText(/Pool:/)).toBeVisible();
}

export async function getRackTileCount(page: import("@playwright/test").Page): Promise<number> {
  const rack = page.locator(".gap-2.p-4.rounded-lg");
  return rack.locator("button").count();
}

export async function getPoolCount(page: import("@playwright/test").Page): Promise<string> {
  const poolSection = page.locator("div.rounded-lg").filter({ hasText: "Pool:" });
  return (await poolSection.locator("span.font-bold.text-amber-400").textContent()) ?? "";
}

export interface SeedState {
  board: { id: string; tiles: { id: string; color: string; value: number }[] }[];
  racks: Record<string, { id: string; color: string; value: number }[]>;
  pool: { id: string; color: string; value: number }[];
  currentTurnPlayerId: string;
  hasInitialMeld: Record<string, boolean>;
  aiScripts?: Record<string, unknown[]>;
}

export async function addAiPlayer(page: Page, model?: string): Promise<void> {
  if (model) {
    await page.locator("select").selectOption(model);
  }
  await page.getByRole("button", { name: "Add AI Player" }).click();
}

export async function startGameWithAi(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start Game" }).click();
  await page.waitForURL(/\/game\//);
  await expect(page.getByText(/Pool:/)).toBeVisible();
}

export async function seedGame(gameCode: string, state: SeedState): Promise<void> {
  const resp = await fetch(`${SERVER_URL}/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameCode, state }),
  });
  expect(resp.ok).toBe(true);
}

export { expect };

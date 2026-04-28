import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";

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
  await page.goto(CLIENT_URL);
  await page.getByPlaceholder("Enter your name").fill(playerName);
  await page.getByPlaceholder("Enter game code").fill(gameCode);
  await page.getByRole("button", { name: "Join Game" }).click();
  await page.waitForURL(/\/lobby\//);
}

export async function joinGameViaLobby(page: import("@playwright/test").Page, playerName: string, gameCode: string) {
  await page.goto(`${CLIENT_URL}/lobby/${gameCode}`);
  await page.getByPlaceholder("Enter your name").fill(playerName);
  await page.getByRole("button", { name: "Join Game" }).click();
  await page.waitForURL(/\/lobby\//);
}

export async function startGame(player1Page: import("@playwright/test").Page, player2Page: import("@playwright/test").Page) {
  await player1Page.getByRole("button", { name: "Start Game" }).click();
  await player1Page.waitForURL(/\/game\//);
  await player2Page.waitForURL(/\/game\//);
}

export async function getRackTileCount(page: import("@playwright/test").Page): Promise<number> {
  const rack = page.locator(".flex.flex-wrap.gap-1.p-3.bg-gray-800.rounded-lg");
  return rack.locator("button").count();
}

export async function getPoolCount(page: import("@playwright/test").Page): Promise<string> {
  const poolSection = page.locator("div.bg-gray-800.rounded-lg").filter({ hasText: "Pool:" });
  return poolSection.locator("span.font-bold.text-amber-400").textContent() ?? "";
}

export { expect };

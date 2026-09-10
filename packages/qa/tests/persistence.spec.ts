import { test, expect, createGame, joinGame, startGame, seedGame, reloadServer, getRackTileCount, getPoolCount } from "./helpers";
import type { SeedState } from "./helpers";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { io as createSocket } from "socket.io-client";
import type { Socket } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const CLIENT_URL = process.env.BASE_URL ?? "http://localhost:5173";

function tile(color: string, value: number, id: string) {
  return { id, color, value };
}

async function createAndStartGame(browser: Browser) {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const gameCode = await createGame(page1, "Alice");
  await joinGame(page2, "Bob", gameCode);
  await startGame(page1, page2);

  const player1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
  const player2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

  return { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id };
}

async function seedAndWait(gameCode: string, seed: SeedState, pages: Page[]) {
  await seedGame(gameCode, seed);
  await pages[0].waitForTimeout(1500);
}

async function getActivePlayer(page1: Page, page2: Page): Promise<Page> {
  await page1.waitForTimeout(500);
  const p1Visible = await page1.getByText("Your turn").isVisible().catch(() => false);
  return p1Visible ? page1 : page2;
}

function waitForState(socket: Socket, predicate: (state: Record<string, unknown>) => boolean, timeoutMs = 8000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("game:state", handler);
      reject(new Error("Timed out waiting for game:state"));
    }, timeoutMs);
    const handler = (data: { gameState: Record<string, unknown> }) => {
      if (predicate(data.gameState)) {
        clearTimeout(timer);
        socket.off("game:state", handler);
        resolve(data.gameState);
      }
    };
    socket.on("game:state", handler);
  });
}

function connectAsPlayer(gameCode: string, playerId: string): Promise<{ socket: Socket; state: Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(SERVER_URL, { transports: ["websocket"] });
    const state = waitForState(socket, () => true);
    socket.on("connect", () => {
      socket.emit("game:reconnect", { gameCode, playerId });
      resolve({ socket, state });
    });
    socket.on("connect_error", reject);
  });
}

async function reconnectViaUi(browser: Browser, playerId: string, gameCode: string, path: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(CLIENT_URL);
  await page.evaluate((ids) => {
    localStorage.setItem("rummikub_playerId", ids.playerId);
    localStorage.setItem("rummikub_gameCode", ids.gameCode);
  }, { playerId, gameCode });
  await page.goto(`${CLIENT_URL}${path}`);
  await page.waitForTimeout(2000);
  return { ctx, page };
}

test.describe("Persistence", () => {
  test("TC-PS-01: Mid-game state survives restart", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    await seedAndWait(gameCode, {
      board: [{ id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a")] }],
      racks: {
        [player1Id]: [tile("red", 13, "red-13-a"), tile("blue", 3, "blue-3-a")],
        [player2Id]: [tile("orange", 1, "orange-1-a")],
      },
      pool: [tile("blue", 5, "blue-5-a"), tile("black", 7, "black-7-a")],
      currentTurnPlayerId: player1Id,
      hasInitialMeld: { [player1Id]: true, [player2Id]: true },
    }, [page1, page2]);

    // Player1 commits a mid-turn play (extends the run with red-13) via a raw socket.
    const { socket: p1Socket, state: initialP1State } = await connectAsPlayer(gameCode, player1Id);
    const initial = await initialP1State;
    expect((initial.yourRack as { id: string }[]).map((t) => t.id)).toContain("red-13-a");

    const newBoard = [
      { id: "s1", tiles: [tile("red", 10, "red-10-a"), tile("red", 11, "red-11-a"), tile("red", 12, "red-12-a"), tile("red", 13, "red-13-a")] },
    ];
    const afterPlayPromise = waitForState(p1Socket, (s) => (s.board as { tiles: unknown[] }[])[0]?.tiles.length === 4);
    p1Socket.emit("turn:manipulate", { newBoard });
    const afterPlay = await afterPlayPromise;
    expect(afterPlay.hasPlayedThisTurn).toBe(true);
    expect((afterPlay.yourRack as { id: string }[]).map((t) => t.id)).not.toContain("red-13-a");

    // Simulated restart.
    const restored = await reloadServer();
    expect(restored).toBeGreaterThanOrEqual(1);

    // Reconnect player1 via the UI.
    const { ctx: ctx3, page: page3 } = await reconnectViaUi(browser, player1Id, gameCode, `/game/${gameCode}`);

    // Player1's restored state matches pre-reload: board shows the placed set, rack/pool/scores/turn/round intact.
    const boardArea = page3.locator(".gap-3.p-5.rounded-xl");
    await expect(boardArea.locator("button").filter({ hasText: "13" })).toBeVisible({ timeout: 5000 });
    expect(await getRackTileCount(page3)).toBe(1);
    expect(await getPoolCount(page3)).toBe("2");
    await expect(page3.getByText(/Round 1/)).toBeVisible();
    await expect(page3.getByText("Your turn — select and place tiles, or manipulate the board")).toBeVisible();
    await expect(page3.getByText(/Player disconnected/)).toBeVisible({ timeout: 5000 });

    // Reconnect player2 via the UI; the disconnected banner disappears on player1's page.
    const { ctx: ctx4, page: page4 } = await reconnectViaUi(browser, player2Id, gameCode, `/game/${gameCode}`);
    await expect(page3.getByText(/Player disconnected/)).toBeHidden({ timeout: 5000 });
    expect(await getRackTileCount(page4)).toBe(1);
    await expect(page4.getByText(/Round 1/)).toBeVisible();

    // Mid-turn undo still reverts to the turn snapshot (server-side via raw socket).
    const afterUndoPromise = waitForState(p1Socket, (s) => (s.board as { tiles: unknown[] }[])[0]?.tiles.length === 3);
    p1Socket.emit("turn:undo");
    const afterUndo = await afterUndoPromise;
    expect((afterUndo.yourRack as { id: string }[]).map((t) => t.id)).toContain("red-13-a");

    p1Socket.close();
    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
    await ctx4.close();
  });

  test("TC-PS-02: Lobby survives restart", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    const gameCode = await createGame(page1, "Alice");
    await joinGame(page2, "Bob", gameCode);
    const player1Id = await page1.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");
    const player2Id = await page2.evaluate(() => localStorage.getItem("rummikub_playerId") ?? "");

    const restored = await reloadServer();
    expect(restored).toBeGreaterThanOrEqual(1);

    // Both players reconnect to the lobby.
    const { ctx: ctx3, page: page3 } = await reconnectViaUi(browser, player1Id, gameCode, `/lobby/${gameCode}`);
    const { ctx: ctx4, page: page4 } = await reconnectViaUi(browser, player2Id, gameCode, `/lobby/${gameCode}`);

    // Lobby shows both players after restore.
    await expect(page3.getByText("Bob")).toBeVisible({ timeout: 5000 });
    await expect(page3.getByText(/2\/4 players/)).toBeVisible();
    await expect(page4.getByText("Alice")).toBeVisible({ timeout: 5000 });
    await expect(page4.getByText(/2\/4 players/)).toBeVisible();

    // Start the game; deals 14 tiles each, pool has 78 tiles.
    await page3.getByRole("button", { name: "Start Game" }).click();
    await page3.waitForURL(/\/game\//);
    await page4.waitForURL(/\/game\//);
    await expect(page3.getByText(/Pool:/)).toBeVisible();
    await expect(page4.getByText(/Pool:/)).toBeVisible();
    expect(await getRackTileCount(page3)).toBe(14);
    expect(await getRackTileCount(page4)).toBe(14);
    expect(await getPoolCount(page3)).toBe("78");

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
    await ctx4.close();
  });

  test("TC-PS-03: Ended game + scores survive restart", async ({ browser }) => {
    const { page1, page2, ctx1, ctx2, gameCode, player1Id, player2Id } = await createAndStartGame(browser);

    // Seed a one-tile-away state: player1 can win by placing red-13.
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
    const rack = activePlayer.locator(".gap-2.p-4.rounded-lg");
    await rack.locator("button").filter({ hasText: "13" }).first().click();
    const boardArea = activePlayer.locator(".gap-3.p-5.rounded-xl");
    await boardArea.locator("button").filter({ hasText: "12" }).first().click();
    await activePlayer.getByRole("button", { name: "End Turn" }).click();

    await expect(page1.getByText("Game Over")).toBeVisible({ timeout: 8000 });
    await expect(page2.getByText("Game Over")).toBeVisible({ timeout: 5000 });

    // Pre-reload end state: Alice +8, Bob -8, Alice has 1 game won.
    await expect(page1.getByText("+8")).toBeVisible();
    await expect(page1.getByText("-8")).toBeVisible();
    await expect(page1.getByText("Games Won")).toBeVisible();
    await expect(page1.locator(".text-amber-400.font-bold").filter({ hasText: /^1$/ })).toBeVisible();

    // Simulated restart.
    const restored = await reloadServer();
    expect(restored).toBeGreaterThanOrEqual(1);

    // Reconnect player1 via a raw socket: scores/gamesWon match pre-reload.
    const { socket: p1Socket, state: p1StatePromise } = await connectAsPlayer(gameCode, player1Id);
    const p1State = await p1StatePromise;
    expect(p1State.phase).toBe("ended");
    expect(p1State.yourScore).toBe(8);
    expect(p1State.yourGamesWon).toBe(1);
    const bob = (p1State.opponents as { id: string; score: number }[]).find((o) => o.id === player2Id);
    expect(bob?.score).toBe(-8);

    // Play Again starts round 2 with scores carried over.
    const round2Promise = waitForState(p1Socket, (s) => s.roundNumber === 2 && s.phase === "playing");
    p1Socket.emit("game:playAgain");
    const round2 = await round2Promise;
    expect(round2.yourScore).toBe(8);
    expect((round2.yourRack as unknown[]).length).toBe(14);
    expect(round2.poolSize).toBe(78);

    p1Socket.close();
    await ctx1.close();
    await ctx2.close();
  });
});

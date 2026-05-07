# Plan 007: Simplify Homepage — Remove Join, Add Game URL + Copy to Lobby

## Goal & Scope

Simplify the homepage to only support **Create Game**. Remove the "Join Game" input and button from the home page. The only way to join a game is by visiting the game URL (e.g. `/lobby/ABC123`), which takes the visitor directly to the lobby where they enter their name and join. Additionally, display the shareable game URL in the lobby with a **Copy** button that copies the URL to the clipboard.

**In scope:**
- Remove Join Game UI from Home page
- Display game URL (not just code) in the Lobby with a Copy button
- Update PRD to reflect the simplified flow
- Update e2e tests and helpers

**Out of scope:**
- Server-side changes (the `game:join` socket event and `/lobby/:code` route already work correctly)
- Changing the game URL format
- Spectator flow changes

## Acceptance Criteria

1. The Home page shows only a name input and "Create Game" button — no join code input, no "Join Game" button
2. After creating a game, the creator lands on the Lobby which displays the full shareable game URL
3. The Lobby has a "Copy" button next to the game URL that copies the URL to the clipboard
4. Clicking "Copy" gives visual feedback (e.g. button text changes briefly to "Copied!")
5. A visitor who navigates to `/lobby/:gameCode` sees the existing join form (name input + "Join Game" button) — this flow is unchanged
6. A visitor who navigates to `/game/:gameCode` for a game they haven't joined falls through to the Lobby join form — this flow is unchanged
7. All existing e2e tests pass after updates

## Edge Cases

- **Clipboard API unavailable**: `navigator.clipboard.writeText` may not be available in insecure contexts (HTTP, not HTTPS). Fallback: use a temporary `<textarea>` + `document.execCommand("copy")` approach.
- **Game URL construction**: The client doesn't know the "base URL" for sharing. Use `window.location.origin` + `/lobby/${gameCode}` to construct the full URL. This works regardless of deployment (localhost, custom domain, etc.).
- **Creator revisits lobby URL**: Already handled — the `hasJoined` state in Lobby is `true` if `playerId` is set, so the creator sees the joined view, not the join form.

## E2E Tests to Update

### `packages/qa/tests/home-page.spec.ts`

| Test | Change |
|------|--------|
| TC-01 | Remove assertions for "Enter game code" placeholder and "Join Game" button. Assert only: heading, name input, Create Game button (disabled) |
| TC-02 | No change needed (only tests Create Game button enablement) |
| TC-03 | **Delete** — Join Game button no longer exists on Home page |

### `packages/qa/tests/game-flow.spec.ts`

| Test | Change |
|------|--------|
| TC-05 | Change to navigate directly to `/lobby/ZZZZZZ` instead of using the home page Join Game form. Fill name, click Join Game on lobby, assert "Game not found" |
| TC-06 | Change `joinGame(page2, "Bob", gameCode)` to `joinGameViaLobby(page2, "Bob", gameCode)` — no longer joins from home page |
| TC-07 | Change `joinGame(...)` calls to `joinGameViaLobby(...)` for players 2-4 |
| TC-24 | Already tests via direct URL — no change needed |

### `packages/qa/tests/helpers.ts`

| Change | Detail |
|--------|--------|
| Remove `joinGame` helper | No longer needed — all joining goes through `joinGameViaLobby` |
| Rename `joinGameViaLobby` → `joinGame` | Keep the simpler name since there's now only one way to join |

### New test: Lobby Copy URL button

| Test | Description |
|------|-------------|
| TC-28 | After creating a game, the lobby displays the game URL. A "Copy" button is visible. Clicking it copies the URL to the clipboard (verify by reading clipboard or checking visual feedback) |

## Implementation Steps

### Step 1: Update `Home.tsx` — Remove Join UI

Remove the `joinCode` state, the `handleJoin` function, the "Game Code" input, and the "Join Game" button. The page becomes a simple card with name input + Create Game button.

**File:** `packages/client/src/pages/Home.tsx`

### Step 2: Update `Lobby.tsx` — Add game URL display + Copy button

In the joined state of the Lobby:
- Compute the game URL: `window.location.origin + "/lobby/" + gameCode`
- Display the game URL as readable text (not just the game code)
- Add a "Copy" button that:
  - Calls `navigator.clipboard.writeText(gameUrl)` (with `<textarea>` + `execCommand` fallback)
  - Shows "Copied!" feedback for ~2 seconds, then reverts to "Copy"
- Keep the existing game code display for reference

**File:** `packages/client/src/pages/Lobby.tsx`

### Step 3: Update `helpers.ts` — Remove old `joinGame`, rename `joinGameViaLobby`

- Delete the `joinGame` function (which joined from the home page)
- Rename `joinGameViaLobby` to `joinGame`

**File:** `packages/qa/tests/helpers.ts`

### Step 4: Update `home-page.spec.ts`

- Remove TC-03 (Join Game button test)
- Update TC-01 to remove Join Game assertions

**File:** `packages/qa/tests/home-page.spec.ts`

### Step 5: Update `game-flow.spec.ts`

- Replace all `joinGame(...)` calls (old home-page-based) with `joinGame(...)` (new, lobby-based — same function name after rename)
- Update TC-05 to navigate to `/lobby/ZZZZZZ` directly instead of using home page join
- Update TC-07 similarly

**File:** `packages/qa/tests/game-flow.spec.ts`

### Step 6: Add TC-28 — Lobby Copy URL test

Add a new test that creates a game, verifies the game URL is displayed in the lobby, and verifies the Copy button exists and provides feedback when clicked.

**File:** `packages/qa/tests/game-flow.spec.ts` (or `home-page.spec.ts` — whichever is more appropriate; game-flow since it involves lobby state)

### Step 7: Update other test files using `joinGame`

Search all test files for imports/usage of `joinGame` and `joinGameViaLobby` and update accordingly. This includes:
- `packages/qa/tests/multiplayer.spec.ts`
- Any other test files that use these helpers

### Step 8: Update `docs/prd.md`

Update the following sections:

**Section 3.7 (Lobby / Home Page):**
- F-36: Change from `"Create Game" button` to just `"Create Game" button (no join form on home page)`
- F-37: Keep as-is (create flow is unchanged)
- F-38: Change to clarify joining is via URL only: `Game joining flow: visit game URL -> enter name -> wait for game to start`
- Add F-39: `The lobby displays the shareable game URL with a "Copy" button to copy it to the clipboard`

**Section 6.2 (Key Screens):**
- Screen 1 (Home page): Change from `Simple landing with "Create Game" button and "Join Game" input (enter code)` to `Simple landing with "Create Game" button only`
- Screen 2 (Lobby): Add mention of game URL display and Copy button

## Affected Files & Packages

| File | Package | Change |
|------|---------|--------|
| `packages/client/src/pages/Home.tsx` | client | Remove join UI |
| `packages/client/src/pages/Lobby.tsx` | client | Add game URL + Copy button |
| `packages/qa/tests/helpers.ts` | qa | Remove old joinGame, rename joinGameViaLobby |
| `packages/qa/tests/home-page.spec.ts` | qa | Remove TC-03, update TC-01 |
| `packages/qa/tests/game-flow.spec.ts` | qa | Update join method, add TC-28 |
| `packages/qa/tests/multiplayer.spec.ts` | qa | Update join method |
| `docs/prd.md` | docs | Update F-36, F-38, add F-39, update §6.2 |

## Manual Validation Steps

1. Start the dev server and navigate to the home page — confirm only name input and Create Game button are visible
2. Create a game — confirm the lobby shows the full game URL and a Copy button
3. Click Copy — confirm "Copied!" feedback appears and the URL is on the clipboard
4. Open an incognito/private window and paste the URL — confirm the lobby join form appears
5. Enter a name and join — confirm the game lobby shows both players
6. Test clipboard fallback in an HTTP context (not HTTPS) if possible

# Plan: Visual Polish — Traditional Board Game Feel

## Goal and Scope

Replace the current flat-coloured Tailwind tile buttons with SVG-rendered tiles that evoke physical Rummikub tiles (cream body, embossed impression, bold coloured numbers, bevelled edges). Increase tile size moderately from 40×56 px to roughly 50×70 px. Update the rack and board container styling to complement the new tiles. Keep the component API and DOM role (`<button>`) unchanged so existing gameplay logic and most E2E selectors continue to work.

## Colour Palette

Use these exact hex values everywhere. Do not approximate with Tailwind named colours.

| Token | Hex | Usage |
|---|---|---|
| `TILE_OUTER` | `#FAF3E0` | Main cream body of the tile (the raised rim). |
| `TILE_INNER` | `#F5F0E1` | Slightly darker cream for the recessed face centre. |
| `TILE_STROKE` | `#D5CDB8` | No longer used (inner rect border removed). |
| `TEXT_RED` | `#E02020` | Red tile numbers. |
| `TEXT_BLUE` | `#0055A4` | Blue tile numbers. |
| `TEXT_ORANGE` | `#F5A623` | Orange/Yellow tile numbers. |
| `TEXT_BLACK` | `#1C1C1C` | Black tile numbers. |
| `JOKER_FACE` | `#333333` | Joker face outline and fills. |
| `RACK_BG` | `#5D3A1A` | Wood-toned rack background. |
| `RACK_LIP` | `#3D2410` | Darker top border on the rack (suggests the lip). |
| `BOARD_BG` | `#0F3815` | Deep felt-green board background. |
| `BOARD_BORDER` | `#1A5C25` | Slightly lighter green board border. |
| `DARK_PANEL_BG` | `#1C1C1C` | Background for Pool / OpponentInfo panels. |
| `DARK_PANEL_BORDER` | `#333333` | Border for Pool / OpponentInfo panels. |

## Tile Dimensions & Typography

- **ViewBox**: `0 0 50 70`
- **Outer rect**: `(1, 1, 48, 68)` with `rx="3"`
- **Inner rect**: `(3, 3, 44, 64)` with `rx="2"`
- **Concave circle**: `cx="25" cy="35" r="16"`
- **Number text**: `x="25" y="44"`, `font-size="26"`, `font-weight="bold"`, `font-family="Arial, Helvetica, sans-serif"`, `text-anchor="middle"`.
- **Drop shadow**: applied via inline CSS `style={{ filter: "drop-shadow(1px 2px 1.5px rgba(0,0,0,0.25))" }}` on the `<svg>` element. Do **not** use SVG `<defs>` / `<filter>` for drop shadows because duplicate IDs across multiple tiles cause rendering bugs.

## SVG Mark-up — Numbered Tile

```tsx
<svg
  viewBox="0 0 50 70"
  width="100%"
  height="100%"
  style={{ filter: "drop-shadow(1px 2px 1.5px rgba(0,0,0,0.25))" }}
>
  <defs>
    <linearGradient id={convexId} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#000000" stopOpacity="0.08" />
      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.35" />
    </linearGradient>
    <linearGradient id={concaveId} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30" />
      <stop offset="100%" stopColor="#000000" stopOpacity="0.05" />
    </linearGradient>
  </defs>
  {/* Base outer body (raised rim) — solid cream colour */}
  <rect
    x="1"
    y="1"
    width="48"
    height="68"
    rx="3"
    fill="#FAF3E0"
  />
  {/* Gradient overlay to create the raised 3-D effect */}
  <rect
    x="1"
    y="1"
    width="48"
    height="68"
    rx="3"
    fill={`url(#${convexId})`}
  />
  {/* Inner recessed face — no border */}
  <rect
    x="3"
    y="3"
    width="44"
    height="64"
    rx="2"
    fill="#F5F0E1"
  />
  {/* Concave circle where the number sits — gradient fill, no stroke */}
  <circle
    cx="25"
    cy="35"
    r="16"
    fill={`url(#${concaveId})`}
  />
  {/* Number */}
  <text
    x="25"
    y="44"
    textAnchor="middle"
    fontFamily="Arial, Helvetica, sans-serif"
    fontWeight="bold"
    fontSize="26"
    fill={textColor}
  >
    {label}
  </text>
</svg>
```

**Important**: The gradients use SVG `<linearGradient>` inside `<defs>`. Because multiple tiles are rendered on the same page, every gradient `id` **must be unique per tile instance** to avoid duplicate-ID rendering bugs. Generate the IDs using React's `useId()` hook (e.g., `const convexId = useId().replace(/:/g, "") + "-cvex"` and `const concaveId = useId().replace(/:/g, "") + "-ccve"`) and embed the `<defs>` block inside the same `<svg>`.

**Why two outer rects?** The base rect provides the solid cream colour (`#FAF3E0`). The second rect applies a semi-transparent gradient on top so the shadow and highlight sit over the cream body rather than fading from black to white on a transparent background.

The gradient definitions are:

```tsx
<defs>
  {/* Raised outer body gradient — darker at top-left, lighter at bottom-right */}
  <linearGradient id={convexId} x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.35" />
  </linearGradient>
  {/* Concave circle gradient — lighter at top-left, darker at bottom-right */}
  <linearGradient id={concaveId} x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
    <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
  </linearGradient>
</defs>
```

This creates the impression of light coming from the top-left:
- The **outer body** looks raised because its gradient is darker at the top-left and lighter at the bottom-right.
- The **concave circle** looks indented because its gradient is lighter at the top-left and darker at the bottom-right.

## SVG Mark-up — Joker Face

When a joker has **no** resolved `displayValue`, render the face instead of a number.

```tsx
<g transform="translate(25, 35)">
  {/* Outer circle — centered in the concave circle, roughly two-thirds its size */}
  <circle
    cx="0"
    cy="0"
    r="10.5"
    fill="none"
    stroke="#333333"
    strokeWidth="1.3"
  />
  {/* Left eye (narrower, no fill) */}
  <ellipse
    cx="-3.5"
    cy="-2.5"
    rx="2.5"
    ry="1.5"
    fill="none"
    stroke="#333333"
    strokeWidth="0.7"
  />
  {/* Left pupil */}
  <circle cx="-3.5" cy="-2.5" r="1" fill="#333333" />
  {/* Right eye (narrower, no fill) */}
  <ellipse
    cx="3.5"
    cy="-2.5"
    rx="2.5"
    ry="1.5"
    fill="none"
    stroke="#333333"
    strokeWidth="0.7"
  />
  {/* Right pupil */}
  <circle cx="3.5" cy="-2.5" r="1" fill="#333333" />
  {/* Nose */}
  <path
    d="M -1,1.5 Q 0,3 1,1.5"
    fill="none"
    stroke="#333333"
    strokeWidth="1"
    strokeLinecap="round"
  />
  {/* Smile */}
  <path
    d="M -5.5,5 Q 0,9.5 5.5,5"
    fill="none"
    stroke="#333333"
    strokeWidth="1"
    strokeLinecap="round"
  />
</g>
```

## Component Specification

### New file: `packages/client/src/components/TileSvg.tsx`

Create a named export `TileSvg` with this exact interface:

```typescript
interface TileSvgProps {
  color: string;       // 'red' | 'blue' | 'orange' | 'black' | 'joker'
  value: number;
  displayValue?: string;
}
```

Implementation rules:
1. Map `color` to `textColor` using the hex values in the Colour Palette table above.
2. Generate two unique gradient IDs using `React.useId()` (strip colons to make them valid SVG ids) — one for the convex (raised) gradient and one for the concave gradient.
3. If `color === "joker"` **and** `displayValue` is undefined/empty, render the Joker Face SVG.
4. Otherwise render the numbered tile SVG with `label = displayValue ?? String(value)`.
5. For jokers with a resolved `displayValue`, use `TEXT_BLACK` (`#1C1C1C`) for the number text.
6. Include the `<defs>` block with both uniquely-IDed linearGradients inside every `<svg>`.
7. Return the complete SVG as shown in the SVG Mark-up sections.

### Modified file: `packages/client/src/components/GameBoard.tsx`

#### `TileComponent`
Keep the outer element as `<button>`. Replace **only** the inner text node with `<TileSvg … />`.

Delete the old `TILE_COLORS` constant entirely.

The new `TileComponent` className must be:

```tsx
className={`inline-flex items-center justify-center w-[50px] h-[70px] rounded-md cursor-pointer select-none transition-transform ${selected ? "ring-2 ring-amber-400 scale-105 z-10" : "hover:scale-[1.02]"}`}
```

Add `aria-label` for jokers:
```tsx
aria-label={isJokerTile ? "Joker" : undefined}
```

#### `Rack`
Change the container div classes to:
```tsx
<div className="flex flex-wrap gap-2 p-4 bg-[#5D3A1A] rounded-lg border-t-4 border-[#3D2410] shadow-inner">
```

#### `TileSetComponent`
Change the container div classes to:
```tsx
<div className={`relative flex flex-wrap gap-2 p-3 rounded-lg ${validationError ? "ring-2 ring-red-500 bg-red-900/40" : "bg-black/20"}`}>
```

#### `Board`
Change the container div classes to:
```tsx
<div className="flex flex-wrap gap-3 p-5 min-h-[200px] bg-[#0F3815] rounded-xl border border-[#1A5C25] shadow-inner cursor-pointer">
```

#### `Pool`
Change the container div classes to:
```tsx
<div className="flex items-center gap-2 px-3 py-2 bg-[#1C1C1C] rounded-lg border border-[#333333]">
```

#### `OpponentInfo`
Change the container div classes to:
```tsx
<div className="flex items-center gap-3 px-3 py-2 bg-[#1C1C1C] rounded-lg border border-[#333333]">
```

## Implementation Steps

1. **Create `packages/client/src/components/TileSvg.tsx`**
   - Implement the `TileSvg` component exactly as specified in the Component Specification section.
   - Import `TileSvgProps` interface and export `TileSvg` as a named export.

2. **Update `packages/client/src/components/GameBoard.tsx`**
   - Import `TileSvg` from `./TileSvg`.
   - Remove the `TILE_COLORS` constant.
   - Refactor `TileComponent`:
     - Replace the inner `{label}` text with `<TileSvg color={tile.color} value={tile.value} displayValue={displayValue} />`.
     - Apply the new button classes (50×70 px, transition, ring, scale).
     - Add `aria-label` for jokers.
   - Update `Rack`, `TileSetComponent`, `Board`, `Pool`, and `OpponentInfo` container classes exactly as specified.

3. **Run unit / integration tests**
   - Ensure any Vitest tests that mount `TileComponent` still pass.

4. **Update E2E joker selectors**
   - In `packages/qa/tests/jokers.spec.ts`, replace `hasText: "★"` with `getByLabelText("Joker")` or `filter({ has: page.getByLabelText("Joker") })`.
   - When clicking a joker on the board, prefer `getByLabelText("Joker")` instead of `nth(1)` on buttons.

5. **Build & typecheck**
   - `docker compose -f docker-compose.dev.yml run --rm dev npm run build`
   - `docker compose -f docker-compose.dev.yml run --rm dev npm run typecheck`

## E2E Tests to Update

| Test File | Lines | Change |
|---|---|---|
| `jokers.spec.ts` | ~57, ~79 | Replace `.filter({ hasText: "★" })` with `.getByLabelText("Joker")`. |
| `jokers.spec.ts` | ~107 | Replace `firstSet.locator("button").nth(1)` with `firstSet.getByLabelText("Joker")`. |

> All other E2E tests should pass unchanged because the outer element remains a `<button>` and numeric labels remain visible text inside the SVG.

## Manual Validation Steps

1. Start the dev server and open the game in two browser tabs.
2. Create a game, join, start.
3. Inspect the rack:
   - Tiles are exactly 50×70 px.
   - Tile body has a raised rim with a gradient that is darker at the top-left and lighter at the bottom-right (no border).
   - Inner recessed face is plain cream (`#F5F0E1`) with no border.
   - A subtle concave circle sits behind each number, lighter at the top-left and darker at the bottom-right (no border).
   - Numbers are bold, centred, and in the correct colour for each tile.
4. If a joker is in the rack, confirm it shows the stylised face SVG: a dark circle roughly two-thirds the size of the concave circle, with small outlined eyes (no fill) and black pupils.
5. Play a joker into a valid run; confirm it displays the resolved number in black (`#1C1C1C`).
6. Click a tile to select it; confirm the amber ring (`ring-amber-400`) and `scale-105` effect are visible.
7. Confirm the rack has a wood-brown background (`#5D3A1A`) and the board has a deep green background (`#0F3815`).
8. Open DevTools responsive mode (375 px width); confirm tiles wrap naturally inside the rack and do not overflow the viewport horizontally.
9. Run E2E tests: `docker compose -f docker-compose.dev.yml run --rm --no-deps playwright npm run test:e2e` — all must pass.

## Documentation Changes

- Update `prd.md` Phase 3 checklist: mark "Visual polish (traditional board game feel)" as complete.
- No other doc changes required.

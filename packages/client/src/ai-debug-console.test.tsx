import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { AiDebugConsole } from "./components/AiDebugConsole";
import {
  AiDebugContext,
  applyDebugEvent,
  applyDebugHistory,
  isNearBottom,
  makeEmptyStore,
  shouldClearDebugStore,
} from "./contexts/AiDebugContext";
import type { AiDebugStore } from "./contexts/AiDebugContext";
import { GameBoard } from "./pages/GameBoard";
import { SpectateBoard } from "./pages/SpectateBoard";
import { GameContext } from "./contexts/GameContext";
import type { AiDebugItem, AiDebugEventPayload, AiDebugHistoryPayload, Tile, PlayerGameState, SpectatorGameState } from "@rummikub/shared";

const RED_7: Tile = { id: "red-7-a", color: "red", value: 7 };
const BLUE_2: Tile = { id: "blue-2-a", color: "blue", value: 2 };
const JOKER: Tile = { id: "joker-1", color: "joker", value: 0 };

function makeItem(type: AiDebugItem["type"], text: string): AiDebugItem {
  return { type, text, ts: "2026-01-01T00:00:00.000Z" };
}

function makeStore(overrides: Partial<AiDebugStore> = {}): AiDebugStore {
  return { transcripts: {}, racks: {}, historyRequested: new Set(), ...overrides };
}

function makeDebugContextValue(overrides: Partial<React.ComponentProps<typeof AiDebugContext.Provider>["value"]> = {}) {
  return {
    transcripts: {},
    racks: {},
    openPlayerId: "ai-1",
    historyRequested: new Set<string>(),
    openConsole: () => {},
    closeConsole: () => {},
    requestHistory: () => {},
    ...overrides,
  };
}

function renderConsole(
  value: ReturnType<typeof makeDebugContextValue>,
  props: { playerName?: string; model?: string } = {}
) {
  return renderToString(
    <AiDebugContext.Provider value={value}>
      <AiDebugConsole playerName={props.playerName ?? "AI: gpt-4"} model={props.model ?? "gpt-4"} />
    </AiDebugContext.Provider>
  );
}

function makePlayerState(overrides: Partial<PlayerGameState> = {}): PlayerGameState {
  return {
    type: "player",
    id: "TEST01",
    phase: "playing",
    yourRack: [RED_7],
    yourName: "Alice",
    board: [],
    poolSize: 50,
    currentTurnPlayerId: "ai-1",
    isYourTurn: false,
    yourScore: 0,
    hasInitialMeld: true,
    hasPlayedThisTurn: false,
    roundNumber: 1,
    yourGamesWon: 0,
    consecutivePasses: 0,
    aiDebug: true,
    opponents: [
      { id: "ai-1", name: "AI: gpt-4", rackSize: 14, score: 0, gamesWon: 0, connected: true, isAI: true, model: "gpt-4" },
    ],
    ...overrides,
  };
}

function makeSpectatorState(overrides: Partial<SpectatorGameState> = {}): SpectatorGameState {
  return {
    type: "spectator",
    id: "TEST01",
    phase: "playing",
    board: [],
    poolSize: 50,
    currentTurnPlayerId: "ai-1",
    players: [
      { id: "p1", name: "Alice", score: 0, gamesWon: 0, connected: true, isAI: false },
      { id: "ai-1", name: "AI: gpt-4", score: 0, gamesWon: 0, connected: true, isAI: true, model: "gpt-4" },
    ],
    roundNumber: 1,
    consecutivePasses: 0,
    aiDebug: true,
    ...overrides,
  };
}

function makeGameContextValue(overrides: Partial<React.ComponentProps<typeof GameContext.Provider>["value"]> = {}) {
  return {
    gameState: null,
    setGameState: () => {},
    playerId: "p1",
    setPlayerId: () => {},
    gameCode: "TEST01",
    setGameCode: () => {},
    error: null,
    setError: () => {},
    isSpectator: false,
    setIsSpectator: () => {},
    spectatorState: null,
    setSpectatorState: () => {},
    lobbyPlayers: [],
    setLobbyPlayers: () => {},
    aiModels: null,
    setAiModels: () => {},
    aiError: null,
    setAiError: () => {},
    ...overrides,
  };
}

function renderPage(ui: React.ReactElement, gameOverrides = {}, debugOverrides = {}) {
  return renderToString(
    <GameContext.Provider value={makeGameContextValue(gameOverrides)}>
      <AiDebugContext.Provider value={makeDebugContextValue(debugOverrides)}>
        {ui}
      </AiDebugContext.Provider>
    </GameContext.Provider>
  );
}

describe("AiDebugConsole", () => {
  it("should render nothing when no player is open", () => {
    const html = renderConsole(makeDebugContextValue({ openPlayerId: null }));
    expect(html).not.toContain("ai-debug-console");
  });

  it("should render the header with the AI player name, model and a close button", () => {
    const html = renderConsole(makeDebugContextValue());
    expect(html).toContain("AI: gpt-4");
    expect(html).toContain("gpt-4");
    expect(html).toContain('aria-label="Close"');
  });

  it("should render the AI rack with the Tile component", () => {
    const html = renderConsole(
      makeDebugContextValue({ racks: { "ai-1": [RED_7, BLUE_2] } })
    );
    expect(html).toContain('aria-label="red 7"');
    expect(html).toContain('aria-label="blue 2"');
  });

  it("should render rack tiles as compact tiles at half the size of board tiles, without the full tile svg", () => {
    const html = renderConsole(
      makeDebugContextValue({ racks: { "ai-1": [RED_7] } })
    );
    expect(html).toContain("w-[25px] h-[35px]");
    expect(html).not.toContain("<svg");
  });

  it("should render rack tiles as simple squares with the tile background colour, slightly rounded corners and a bold centred number", () => {
    const html = renderConsole(
      makeDebugContextValue({ racks: { "ai-1": [RED_7] } })
    );
    expect(html).toContain("bg-[#FAF3E0]");
    expect(html).toContain("rounded-sm");
    expect(html).toContain("font-bold");
    expect(html).toContain(">7<");
  });

  it("should colour the rack tile number with the tile colour", () => {
    const html = renderConsole(
      makeDebugContextValue({ racks: { "ai-1": [RED_7, BLUE_2] } })
    );
    expect(html).toContain("#E02020");
    expect(html).toContain("#0055A4");
  });

  it("should render the joker as a simple star symbol", () => {
    const html = renderConsole(
      makeDebugContextValue({ racks: { "ai-1": [JOKER] } })
    );
    expect(html).toContain('aria-label="Joker"');
    expect(html).toContain("★");
  });

  it("should render a sensible empty state before the AI's first turn", () => {
    const html = renderConsole(makeDebugContextValue());
    expect(html).toContain("No transcript yet");
  });

  it("should render each item type with a distinct data-item-type and readable text", () => {
    const html = renderConsole(
      makeDebugContextValue({
        transcripts: {
          "ai-1": [
            makeItem("prompt", "Turn 1 has started. Call get_game_state to see the board."),
            makeItem("thinking", "The rack has 7, 8, 9 red; drawing is safe."),
            makeItem("tool_call", "draw_tile"),
            makeItem("response", "I will draw a tile."),
          ],
        },
      })
    );

    expect(html).toContain('data-item-type="prompt"');
    expect(html).toContain('data-item-type="thinking"');
    expect(html).toContain('data-item-type="tool_call"');
    expect(html).toContain('data-item-type="response"');

    expect(html).toContain("Turn 1 has started. Call get_game_state to see the board.");
    expect(html).toContain("The rack has 7, 8, 9 red; drawing is safe.");
    expect(html).toContain("draw_tile");
    expect(html).toContain("I will draw a tile.");

    expect(html).toContain(">Prompt<");
    expect(html).toContain(">Thinking<");
    expect(html).toContain("Tool call:");
    expect(html).toContain(">Response<");
  });

  it("should style each item type differently", () => {
    const promptHtml = renderConsole(
      makeDebugContextValue({ transcripts: { "ai-1": [makeItem("prompt", "hello")] } })
    );
    const thinkingHtml = renderConsole(
      makeDebugContextValue({ transcripts: { "ai-1": [makeItem("thinking", "hello")] } })
    );
    const toolCallHtml = renderConsole(
      makeDebugContextValue({ transcripts: { "ai-1": [makeItem("tool_call", "draw_tile")] } })
    );
    const responseHtml = renderConsole(
      makeDebugContextValue({ transcripts: { "ai-1": [makeItem("response", "hello")] } })
    );

    const extractItemClass = (html: string) => {
      const match = html.match(/data-item-type="[a-z_]+" class="([^"]*)"/);
      expect(match).not.toBeNull();
      return match![1];
    };

    const classes = [
      extractItemClass(promptHtml),
      extractItemClass(thinkingHtml),
      extractItemClass(toolCallHtml),
      extractItemClass(responseHtml),
    ];
    expect(new Set(classes).size).toBe(4);
  });

  it("should render readable text only (no raw JSON envelope)", () => {
    const html = renderConsole(
      makeDebugContextValue({
        transcripts: {
          "ai-1": [
            makeItem("prompt", "Turn 1 has started. Call get_game_state to see the board."),
            makeItem("response", "I will draw a tile."),
          ],
        },
      })
    );
    expect(html).toContain("I will draw a tile.");
    expect(html).not.toContain('"playerId"');
    expect(html).not.toContain('"tool_calls"');
    expect(html).not.toContain('"roundNumber"');
  });
});

describe("isNearBottom", () => {
  it("should return true when scrolled to the bottom", () => {
    expect(isNearBottom(300, 500, 200)).toBe(true);
  });

  it("should return true within a small threshold of the bottom", () => {
    expect(isNearBottom(295, 500, 200)).toBe(true);
  });

  it("should return false when scrolled up away from the bottom", () => {
    expect(isNearBottom(100, 500, 200)).toBe(false);
  });
});

describe("makeEmptyStore", () => {
  it("should return a fresh store with empty maps and a fresh historyRequested set on each call", () => {
    const a = makeEmptyStore();
    const b = makeEmptyStore();

    expect(a).not.toBe(b);
    expect(a.historyRequested).not.toBe(b.historyRequested);
    expect(a.transcripts).toEqual({});
    expect(a.racks).toEqual({});
    expect(a.historyRequested).toEqual(new Set());
  });
});

describe("shouldClearDebugStore", () => {
  it("should return true when there was no previous scope", () => {
    expect(shouldClearDebugStore(null, { gameCode: "TEST01", roundNumber: 1 })).toBe(true);
  });

  it("should return false when neither the game nor the round changed", () => {
    expect(
      shouldClearDebugStore({ gameCode: "TEST01", roundNumber: 1 }, { gameCode: "TEST01", roundNumber: 1 })
    ).toBe(false);
  });

  it("should return true when the round changes within the same game", () => {
    expect(
      shouldClearDebugStore({ gameCode: "TEST01", roundNumber: 1 }, { gameCode: "TEST01", roundNumber: 2 })
    ).toBe(true);
  });

  it("should return true when the game changes even if the round is the same", () => {
    expect(
      shouldClearDebugStore({ gameCode: "TEST01", roundNumber: 1 }, { gameCode: "OTHER9", roundNumber: 1 })
    ).toBe(true);
  });
});

describe("AiDebug store helpers", () => {
  it("should append live items and update the rack", () => {
    const store = makeStore();
    const payload: AiDebugEventPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      item: makeItem("tool_call", "draw_tile"),
      rack: [RED_7],
    };

    const next = applyDebugEvent(store, payload, 1);

    expect(next.transcripts["ai-1"].map((i) => i.type)).toEqual(["tool_call"]);
    expect(next.racks["ai-1"]).toEqual([RED_7]);
  });

  it("should ignore live events whose roundNumber does not match the current round", () => {
    const store = makeStore({
      transcripts: { "ai-1": [makeItem("prompt", "old item")] },
      racks: { "ai-1": [RED_7] },
    });
    const payload: AiDebugEventPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      item: makeItem("tool_call", "draw_tile"),
      rack: [],
    };

    const next = applyDebugEvent(store, payload, 2);

    expect(next.transcripts["ai-1"]).toHaveLength(1);
    expect(next.racks["ai-1"]).toEqual([RED_7]);
  });

  it("should keep other players' transcripts untouched when appending", () => {
    const store = makeStore({
      transcripts: { "ai-2": [makeItem("prompt", "ai-2 item")] },
    });
    const payload: AiDebugEventPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      item: makeItem("prompt", "ai-1 item"),
      rack: [],
    };

    const next = applyDebugEvent(store, payload, 1);

    expect(next.transcripts["ai-2"]).toHaveLength(1);
    expect(next.transcripts["ai-1"].map((i) => i.text)).toEqual(["ai-1 item"]);
  });

  it("should replace the transcript and rack on history response", () => {
    const historyPayload: AiDebugHistoryPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      items: [makeItem("prompt", "history item")],
      rack: [BLUE_2],
    };

    const next = applyDebugHistory(
      makeStore({ transcripts: { "ai-1": [makeItem("prompt", "partial")] } }),
      historyPayload,
      1
    );

    expect(next.transcripts["ai-1"].map((i) => i.text)).toEqual(["history item"]);
    expect(next.racks["ai-1"]).toEqual([BLUE_2]);
  });

  it("should ignore history responses for a previous round", () => {
    const historyPayload: AiDebugHistoryPayload = {
      playerId: "ai-1",
      roundNumber: 1,
      items: [makeItem("prompt", "stale history")],
      rack: [],
    };

    const next = applyDebugHistory(makeStore(), historyPayload, 2);

    expect(next.transcripts["ai-1"]).toBeUndefined();
  });
});

describe("AI debug strip clickability", () => {
  it("should render AI opponents as clickable buttons when aiDebug is on", () => {
    const html = renderPage(<GameBoard />, { gameState: makePlayerState() });
    expect(html).toContain('data-testid="ai-debug-player"');
    expect(html).toContain("cursor-pointer");
  });

  it("should not render clickable AI opponents when aiDebug is off", () => {
    const html = renderPage(
      <GameBoard />,
      { gameState: makePlayerState({ aiDebug: false }) }
    );
    expect(html).not.toContain('data-testid="ai-debug-player"');
  });

  it("should render human opponents as non-clickable entries even when aiDebug is on", () => {
    const html = renderPage(
      <GameBoard />,
      {
        gameState: makePlayerState({
          opponents: [
            { id: "p2", name: "Bob", rackSize: 14, score: 0, gamesWon: 0, connected: true, isAI: false },
          ],
        }),
      }
    );
    expect(html).not.toContain('data-testid="ai-debug-player"');
  });

  it("should render the debug console on the game board when a player is open", () => {
    const html = renderPage(<GameBoard />, { gameState: makePlayerState() });
    expect(html).toContain("ai-debug-console");
  });

  it("should not render the debug console when no player is open", () => {
    const html = renderPage(
      <GameBoard />,
      { gameState: makePlayerState() },
      { openPlayerId: null }
    );
    expect(html).not.toContain("ai-debug-console");
  });

  it("should render AI players as clickable in the spectator strip when aiDebug is on", () => {
    const html = renderPage(<SpectateBoard />, { spectatorState: makeSpectatorState() });
    expect(html).toContain('data-testid="ai-debug-player"');
  });

  it("should not render clickable spectator strip entries when aiDebug is off", () => {
    const html = renderPage(
      <SpectateBoard />,
      { spectatorState: makeSpectatorState({ aiDebug: false }), isSpectator: true }
    );
    expect(html).not.toContain('data-testid="ai-debug-player"');
  });

  it("should render the debug console on the spectator board when a player is open", () => {
    const html = renderPage(
      <SpectateBoard />,
      { spectatorState: makeSpectatorState(), isSpectator: true }
    );
    expect(html).toContain("ai-debug-console");
  });
});

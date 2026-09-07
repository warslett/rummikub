import { describe, it, expect, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OpponentInfo, Controls } from "./components/GameBoard";
import { Lobby } from "./pages/Lobby";
import { GameBoard } from "./pages/GameBoard";
import { SpectateBoard } from "./pages/SpectateBoard";
import { GameContext } from "./contexts/GameContext";
import type { PlayerGameState, SpectatorGameState, AiErrorPayload } from "@rummikub/shared";

beforeEach(() => {
  if (typeof window === "undefined") {
    (globalThis as unknown as { window: unknown }).window = {
      location: { origin: "http://localhost:3000" },
    };
  }
});

function renderWithContext(
  ui: React.ReactElement,
  contextOverrides: Partial<React.ComponentProps<typeof GameContext.Provider>["value"]> = {}
) {
  const defaultValue = {
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
    aiModels: { models: ["model-a", "model-b"], defaultModel: "model-a" },
    setAiModels: () => {},
    aiError: null,
    setAiError: () => {},
    ...contextOverrides,
  };

  return renderToString(
    <GameContext.Provider value={defaultValue}>
      <MemoryRouter initialEntries={["/lobby/TEST01"]}>
        <Routes>
          <Route path="/lobby/:gameCode" element={ui} />
          <Route path="/game/:gameCode" element={ui} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </GameContext.Provider>
  );
}

describe("AI UI components", () => {
  describe("OpponentInfo", () => {
    it("should render AI badge with model name when opponent is AI", () => {
      const html = renderToString(
        <OpponentInfo name="AI: gpt-4" rackSize={14} isAI={true} model="gpt-4" />
      );
      expect(html).toContain("AI · gpt-4");
    });

    it("should not render AI badge when opponent is human", () => {
      const html = renderToString(
        <OpponentInfo name="Bob" rackSize={14} isAI={false} />
      );
      expect(html).not.toContain("AI ·");
    });
  });

  describe("Controls", () => {
    it("should show 'AI is thinking...' when it is an AI opponent's turn", () => {
      const html = renderToString(
        <Controls
          isYourTurn={false}
          isAiTurn={true}
          selectedCount={0}
          hasPlayedThisTurn={false}
          hasChanges={false}
          poolSize={50}
          onPlay={() => {}}
          onUndo={() => {}}
          onEndTurn={() => {}}
          onDraw={() => {}}
          onPass={() => {}}
        />
      );
      expect(html).toContain("AI is thinking...");
    });

    it("should show 'Waiting for other players...' when it is a human opponent's turn", () => {
      const html = renderToString(
        <Controls
          isYourTurn={false}
          isAiTurn={false}
          selectedCount={0}
          hasPlayedThisTurn={false}
          hasChanges={false}
          poolSize={50}
          onPlay={() => {}}
          onUndo={() => {}}
          onEndTurn={() => {}}
          onDraw={() => {}}
          onPass={() => {}}
        />
      );
      expect(html).toContain("Waiting for other players...");
    });
  });

  describe("Lobby", () => {
    it("should render Add AI Player button and dropdown with fetched models", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [{ id: "p1", name: "Alice", isAI: false }],
        aiModels: { models: ["gpt-4", "claude-3"], defaultModel: "gpt-4" },
      });

      expect(html).toContain("gpt-4");
      expect(html).toContain("claude-3");
      expect(html).toContain(">Add</button>");
      expect(html).not.toContain("Add AI Player");
    });

    it("should render an AI player name input", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [{ id: "p1", name: "Alice", isAI: false }],
        aiModels: { models: ["gpt-4"], defaultModel: "gpt-4" },
      });

      expect(html).toContain("AI Player Name");
    });

    it("should render Add AI Player button on a single line with the dropdown", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [{ id: "p1", name: "Alice", isAI: false }],
        aiModels: { models: ["gpt-4"], defaultModel: "gpt-4" },
      });

      expect(html).toContain("whitespace-nowrap");
    });

    it("should select first model when defaultModel is not in models list", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [{ id: "p1", name: "Alice", isAI: false }],
        aiModels: { models: ["claude-3-haiku", "gpt-4o"], defaultModel: "scripted-default" },
      });

      expect(html).toContain('value="claude-3-haiku" selected=""');
    });

    it("should disable Add AI Player button when lobby is full (4 players)", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [
          { id: "p1", name: "Alice", isAI: false },
          { id: "ai-1", name: "AI: m1", isAI: true, model: "m1" },
          { id: "ai-2", name: "AI: m2", isAI: true, model: "m2" },
          { id: "ai-3", name: "AI: m3", isAI: true, model: "m3" },
        ],
      });

      expect(html).toContain("disabled");
    });

    it("should show AI badge and remove button for AI players in lobby", () => {
      const html = renderWithContext(<Lobby />, {
        playerId: "p1",
        gameCode: "TEST01",
        lobbyPlayers: [
          { id: "p1", name: "Alice", isAI: false },
          { id: "ai-1", name: "AI: gpt-4", isAI: true, model: "gpt-4" },
        ],
      });

      expect(html).toContain("AI: gpt-4");
      expect(html).toContain("AI");
      expect(html).toContain("×");
    });
  });

  describe("GameBoard Stuck Banner", () => {
    it("should render stuck banner when aiError is present", () => {
      const sampleState: PlayerGameState = {
        type: "player",
        id: "TEST01",
        phase: "playing",
        yourRack: [],
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
        aiDebug: false,
        opponents: [{ id: "ai-1", name: "AI: gpt-4", rackSize: 14, score: 0, gamesWon: 0, connected: true, isAI: true, model: "gpt-4" }],
      };

      const aiError: AiErrorPayload = {
        playerId: "ai-1",
        playerName: "AI: gpt-4",
        message: "Network gateway timeout",
      };

      const html = renderWithContext(<GameBoard />, {
        gameState: sampleState,
        playerId: "p1",
        gameCode: "TEST01",
        aiError,
      });

      expect(html).toContain("AI player stuck: AI: gpt-4 — Network gateway timeout. Restart the server to recover.");
    });
  });

  describe("SpectateBoard", () => {
    it("should show AI badge in player list", () => {
      const spectatorState: SpectatorGameState = {
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
        aiDebug: false,
      };

      const html = renderWithContext(<SpectateBoard />, {
        isSpectator: true,
        spectatorState,
      });

      expect(html).toContain("AI · gpt-4");
    });
  });

  describe("AI debug strip clickability", () => {
    it("should render OpponentInfo as a clickable button when debugClickable is set", () => {
      const html = renderToString(
        <OpponentInfo
          name="AI: gpt-4"
          rackSize={14}
          isAI={true}
          model="gpt-4"
          debugClickable={true}
          onDebugClick={() => {}}
        />
      );
      expect(html).toContain('data-testid="ai-debug-player"');
      expect(html).toContain("cursor-pointer");
    });

    it("should render OpponentInfo as a plain div when not debug-clickable", () => {
      const html = renderToString(
        <OpponentInfo name="AI: gpt-4" rackSize={14} isAI={true} model="gpt-4" />
      );
      expect(html).not.toContain('data-testid="ai-debug-player"');
    });

    it("should keep the OpponentInfo markup unchanged for human opponents", () => {
      const human = renderToString(<OpponentInfo name="Bob" rackSize={14} isAI={false} />);
      const ai = renderToString(
        <OpponentInfo name="AI: gpt-4" rackSize={14} isAI={true} model="gpt-4" />
      );
      expect(human).not.toContain("AI ·");
      expect(ai).toContain("AI · gpt-4");
    });
  });
});

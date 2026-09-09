import { describe, it, expect, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OpponentInfo } from "./components/GameBoard";
import { GameBoard } from "./pages/GameBoard";
import { SpectateBoard } from "./pages/SpectateBoard";
import { GameContext } from "./contexts/GameContext";
import type { PlayerGameState, SpectatorGameState } from "@rummikub/shared";

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
      <MemoryRouter initialEntries={["/game/TEST01"]}>
        <Routes>
          <Route path="/game/:gameCode" element={ui} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </GameContext.Provider>
  );
}

function playerState(currentTurnPlayerId: string): PlayerGameState {
  return {
    type: "player",
    id: "TEST01",
    phase: "playing",
    yourRack: [],
    yourName: "Alice",
    board: [],
    poolSize: 50,
    currentTurnPlayerId,
    isYourTurn: currentTurnPlayerId === "p1",
    yourScore: 0,
    hasInitialMeld: true,
    hasPlayedThisTurn: false,
    roundNumber: 1,
    yourGamesWon: 0,
    consecutivePasses: 0,
    aiDebug: false,
    opponents: [
      { id: "p2", name: "Bob", rackSize: 14, score: 0, gamesWon: 0, connected: true, isAI: false },
      { id: "p3", name: "Cara", rackSize: 14, score: 0, gamesWon: 0, connected: true, isAI: false },
    ],
  };
}

function spectatorState(currentTurnPlayerId: string): SpectatorGameState {
  return {
    type: "spectator",
    id: "TEST01",
    phase: "playing",
    board: [],
    poolSize: 50,
    currentTurnPlayerId,
    players: [
      { id: "p1", name: "Alice", score: 0, gamesWon: 0, connected: true, isAI: false },
      { id: "ai-1", name: "AI: gpt-4", score: 0, gamesWon: 0, connected: true, isAI: true, model: "gpt-4" },
    ],
    roundNumber: 1,
    consecutivePasses: 0,
    aiDebug: false,
  };
}

describe("current turn highlight", () => {
  function countOccurrences(html: string, needle: string): number {
    return html.split(needle).length - 1;
  }

  describe("OpponentInfo", () => {
    it("should highlight the panel when it is that opponent's turn", () => {
      const html = renderToString(<OpponentInfo name="Bob" rackSize={14} isCurrentTurn={true} />);
      expect(html).toContain("border-amber-400");
      expect(html).toContain("text-amber-300");
      expect(html).not.toContain("border-[#333333]");
    });

    it("should not highlight the panel when it is not that opponent's turn", () => {
      const html = renderToString(<OpponentInfo name="Bob" rackSize={14} />);
      expect(html).toContain("border-[#333333]");
      expect(html).not.toContain("border-amber-400");
      expect(html).not.toContain("text-amber-300");
    });

    it("should keep disconnected name red even when it is their turn", () => {
      const html = renderToString(
        <OpponentInfo name="Bob" rackSize={14} disconnected={true} isCurrentTurn={true} />
      );
      expect(html).toContain("text-red-400");
      expect(html).toContain("border-amber-400");
    });
  });

  describe("GameBoard", () => {
    it("should highlight the opponent whose turn it is", () => {
      const html = renderWithContext(<GameBoard />, {
        gameState: playerState("p2"),
        playerId: "p1",
        gameCode: "TEST01",
      });
      expect(html).toContain("border-amber-400");
      expect(countOccurrences(html, "border-amber-400")).toBe(1);
      expect(countOccurrences(html, "border-[#333333]")).toBe(2);
    });

    it("should highlight no opponent panel when it is your turn", () => {
      const html = renderWithContext(<GameBoard />, {
        gameState: playerState("p1"),
        playerId: "p1",
        gameCode: "TEST01",
      });
      expect(html).not.toContain("border-amber-400");
    });
  });

  describe("SpectateBoard", () => {
    it("should highlight the current player's panel in spectator view", () => {
      const html = renderWithContext(<SpectateBoard />, {
        isSpectator: true,
        spectatorState: spectatorState("ai-1"),
      });
      expect(html).toContain("border-amber-400");
      expect(html).toContain("text-amber-300");
    });
  });
});

import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GameContext, useGame } from "./contexts/GameContext";
import { socket } from "./socket";
import type { PlayerGameState } from "@rummikub/shared";
import { Home } from "./pages/Home";
import { Lobby } from "./pages/Lobby";
import { GameBoard } from "./pages/GameBoard";
import { GameOver } from "./pages/GameOver";

interface GameEndedData {
  winnerId: string;
  winnerName: string;
  scores: { playerId: string; name: string; score: number; rackValue: number }[];
  roundNumber: number;
  isStalemate: boolean;
  gamesWon: { playerId: string; gamesWon: number }[];
}

export function App() {
  const [gameState, setGameState] = useState<PlayerGameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() => localStorage.getItem("rummikub_playerId"));
  const [gameCode, setGameCode] = useState<string | null>(() => localStorage.getItem("rummikub_gameCode"));
  const [error, setError] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<GameEndedData | null>(null);

  useEffect(() => {
    if (playerId) localStorage.setItem("rummikub_playerId", playerId);
    else localStorage.removeItem("rummikub_playerId");
  }, [playerId]);

  useEffect(() => {
    if (gameCode) localStorage.setItem("rummikub_gameCode", gameCode);
    else localStorage.removeItem("rummikub_gameCode");
  }, [gameCode]);

  useEffect(() => {
    socket.on("game:state", ({ gameState: state }: { gameState: PlayerGameState }) => {
      setGameState(state);
    });

    socket.on("game:started", ({ gameState: state }: { gameState: PlayerGameState }) => {
      setGameState(state);
    });

    socket.on("game:ended", (data: GameEndedData) => {
      setGameEnded(data);
    });

    socket.on("move:rejected", ({ reason }: { reason: string }) => {
      setError(reason);
      setTimeout(() => setError(null), 3000);
    });

    socket.on("game:error", ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    socket.on("game:created", ({ gameCode: code, playerId: pid }: { gameCode: string; playerId: string }) => {
      setPlayerId(pid);
      setGameCode(code);
    });

    socket.on("game:joined", ({ playerId: pid }: { playerId: string; opponentName: string }) => {
      setPlayerId(pid);
    });

    return () => {
      socket.off("game:state");
      socket.off("game:started");
      socket.off("game:ended");
      socket.off("move:rejected");
      socket.off("game:error");
      socket.off("game:created");
      socket.off("game:joined");
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider value={{ gameState, setGameState, playerId, setPlayerId, gameCode, setGameCode, error, setError: clearError }}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-900 text-white">
          {error && (
            <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-2 rounded shadow-lg">
              {error}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:gameCode" element={<GameBoardWrapper />} />
            <Route path="/lobby/:gameCode" element={<Lobby />} />
            <Route path="/game-over" element={gameEnded ? <GameOver result={gameEnded} /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </BrowserRouter>
    </GameContext.Provider>
  );
}

function GameBoardWrapper() {
  const { gameState, playerId } = useGame();
  const [gameEnded, setGameEnded] = useState<GameEndedData | null>(null);

  useEffect(() => {
    function onGameEnded(data: GameEndedData) {
      setGameEnded(data);
    }
    socket.on("game:ended", onGameEnded);
    return () => {
      socket.off("game:ended", onGameEnded);
    };
  }, []);

  useEffect(() => {
    if (gameEnded && gameState && gameState.phase === "playing") {
      setGameEnded(null);
    }
  }, [gameState]);

  if (!gameState || !playerId) {
    const savedPlayerId = localStorage.getItem("rummikub_playerId");
    const savedGameCode = localStorage.getItem("rummikub_gameCode");
    if (savedPlayerId && savedGameCode && !socket.connected) {
      socket.connect();
      socket.emit("game:reconnect", { gameCode: savedGameCode, playerId: savedPlayerId });
    }
    return <Lobby />;
  }

  if (gameEnded) {
    return <GameOver result={gameEnded} />;
  }

  return <GameBoard />;
}

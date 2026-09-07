import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GameContext, useGame } from "./contexts/GameContext";
import type { LobbyPlayer } from "./contexts/GameContext";
import { AiDebugProvider } from "./contexts/AiDebugContext";
import { socket } from "./socket";
import type { PlayerGameState, SpectatorGameState, AiModelsPayload, AiErrorPayload } from "@rummikub/shared";
import { Home } from "./pages/Home";
import { Lobby } from "./pages/Lobby";
import { GameBoard } from "./pages/GameBoard";
import { SpectateBoard } from "./pages/SpectateBoard";
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
  const [isSpectator, setIsSpectator] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [spectatorState, setSpectatorState] = useState<SpectatorGameState | null>(null);
  const [aiModels, setAiModels] = useState<AiModelsPayload | null>(null);
  const [aiError, setAiError] = useState<AiErrorPayload | null>(null);

  useEffect(() => {
    if (playerId) localStorage.setItem("rummikub_playerId", playerId);
    else localStorage.removeItem("rummikub_playerId");
  }, [playerId]);

  useEffect(() => {
    if (gameCode) localStorage.setItem("rummikub_gameCode", gameCode);
    else localStorage.removeItem("rummikub_gameCode");
  }, [gameCode]);

  useEffect(() => {
    socket.on("game:state", ({ gameState: state }: { gameState: PlayerGameState | SpectatorGameState }) => {
      if (state.type === "spectator") {
        setSpectatorState(state);
      } else {
        setGameState(state);
      }
    });

    socket.on("game:started", ({ gameState: state }: { gameState: PlayerGameState | SpectatorGameState }) => {
      if (state.type === "spectator") {
        setSpectatorState(state);
      } else {
        setGameState(state);
      }
    });

    socket.on("game:ended", (data: GameEndedData) => {
      setGameEnded(data);
    });

    socket.on("spectator:joined", ({ gameState: state }: { gameState: SpectatorGameState }) => {
      setSpectatorState(state);
      setIsSpectator(true);
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

    socket.on("game:joined", ({ playerId: pid }: { playerId: string }) => {
      setPlayerId(pid);
    });

    socket.on("game:lobbyState", ({ players }: { players: LobbyPlayer[] }) => {
      setLobbyPlayers(players);
    });

    socket.on("ai:models", (data: AiModelsPayload) => {
      setAiModels(data);
    });

    socket.on("ai:error", (data: AiErrorPayload) => {
      setAiError(data);
    });

    return () => {
      socket.off("game:state");
      socket.off("game:started");
      socket.off("game:ended");
      socket.off("spectator:joined");
      socket.off("move:rejected");
      socket.off("game:error");
      socket.off("game:created");
      socket.off("game:joined");
      socket.off("game:lobbyState");
      socket.off("ai:models");
      socket.off("ai:error");
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <GameContext.Provider value={{ gameState, setGameState, playerId, setPlayerId, gameCode, setGameCode, error, setError: clearError, isSpectator, setIsSpectator, spectatorState, setSpectatorState, lobbyPlayers, setLobbyPlayers, aiModels, setAiModels, aiError, setAiError }}>
      <AiDebugProvider>
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
      </AiDebugProvider>
    </GameContext.Provider>
  );
}

function GameBoardWrapper() {
  const { gameState, playerId, isSpectator, spectatorState } = useGame();
  const [gameEnded, setGameEnded] = useState<GameEndedData | null>(null);
  const [gameIsFull, setGameIsFull] = useState(false);

  useEffect(() => {
    function onGameEnded(data: GameEndedData) {
      setGameEnded(data);
    }
    function onGameFull() {
      setGameIsFull(true);
    }
    function onGameJoined() {
      setGameIsFull(false);
    }
    socket.on("game:ended", onGameEnded);
    socket.on("game:full", onGameFull);
    socket.on("game:joined", onGameJoined);
    return () => {
      socket.off("game:ended", onGameEnded);
      socket.off("game:full", onGameFull);
      socket.off("game:joined", onGameJoined);
    };
  }, []);

  useEffect(() => {
    if (gameEnded && gameState && gameState.phase === "playing") {
      setGameEnded(null);
    }
    if (gameEnded && spectatorState && spectatorState.phase === "playing") {
      setGameEnded(null);
    }
  }, [gameState, spectatorState]);

  if (isSpectator) {
    if (gameEnded) {
      return <GameOver result={gameEnded} />;
    }
    if (spectatorState) {
      return <SpectateBoard />;
    }
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  if (gameIsFull && !isSpectator) {
    function handleSpectate() {
      const savedGameCode = localStorage.getItem("rummikub_gameCode");
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit("game:spectate", { gameCode: savedGameCode ?? "" });
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-3xl font-bold text-amber-400">Game In Progress</h1>
        <p className="text-gray-400">This game is full.</p>
        <button
          onClick={handleSpectate}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-600 rounded font-bold text-lg"
        >
          Watch as Spectator
        </button>
      </div>
    );
  }

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

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { useGame } from "../contexts/GameContext";

export function Lobby() {
  const { gameCode } = useParams<{ gameCode: string }>();
  const navigate = useNavigate();
  const { playerId, setPlayerId, setGameState, setGameCode } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(playerId !== null);

  useEffect(() => {
    if (gameCode) {
      setGameCode(gameCode);
    }
  }, [gameCode, setGameCode]);

  useEffect(() => {
    function onJoined(data: { playerId: string; opponentName: string }) {
      setOpponentJoined(true);
      setOpponentName(data.opponentName);
    }

    function onStarted(data: { gameState: unknown }) {
      setGameState(data.gameState as Parameters<typeof setGameState>[0]);
      if (gameCode) {
        navigate(`/game/${gameCode}`);
      }
    }

    socket.on("game:joined", onJoined);
    socket.on("game:started", onStarted);

    return () => {
      socket.off("game:joined", onJoined);
      socket.off("game:started", onStarted);
    };
  }, [setGameState, gameCode, navigate]);

  function handleJoin() {
    if (!playerName.trim() || !gameCode) return;
    socket.connect();
    socket.emit("game:join", { gameCode, playerName: playerName.trim() });
    socket.once("game:joined", ({ playerId: id }: { playerId: string }) => {
      setPlayerId(id);
      setHasJoined(true);
    });
    socket.once("game:error", () => {
      setHasJoined(false);
    });
  }

  function handleStart() {
    if (!gameCode) return;
    socket.emit("game:start", { gameCode });
  }

  if (!hasJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <h1 className="text-4xl font-bold text-amber-400">Join Game</h1>
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-4">
          <div className="text-center">
            <p className="text-gray-400 text-sm">Game Code</p>
            <p className="text-3xl font-mono font-bold tracking-widest text-amber-400">{gameCode}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your Name</label>
            <input
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-amber-400 focus:outline-none"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={!playerName.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold text-lg"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-4xl font-bold text-amber-400">Lobby</h1>
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-4">
        <div className="text-center">
          <p className="text-gray-400 text-sm">Game Code</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-amber-400">{gameCode}</p>
        </div>
        <div className="text-center text-gray-400 text-sm">
          Share this code with your opponent
        </div>
        <div className="border-t border-gray-600 pt-4 space-y-2">
          <p className="text-sm text-gray-300">
            {!opponentJoined ? "Waiting for opponent..." : `Opponent: ${opponentName}`}
          </p>
          {opponentJoined && (
            <button
              onClick={handleStart}
              className="w-full py-3 bg-green-600 hover:bg-green-700 rounded font-bold text-lg"
            >
              Start Game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

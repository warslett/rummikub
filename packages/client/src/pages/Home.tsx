import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { useGame } from "../contexts/GameContext";

export function Home() {
  const navigate = useNavigate();
  const { setPlayerId, setGameCode } = useGame();
  const [playerName, setPlayerName] = useState("");

  function handleCreate() {
    if (!playerName.trim()) return;
    socket.connect();
    socket.emit("game:create", { playerName: playerName.trim() });
    socket.once("game:created", ({ gameCode, playerId }: { gameCode: string; playerId: string }) => {
      setPlayerId(playerId);
      setGameCode(gameCode);
      navigate(`/lobby/${gameCode}`);
    });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8">
      <h1 className="text-5xl font-bold text-amber-400">Rummikub</h1>
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Your Name</label>
          <input
            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-amber-400 focus:outline-none"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={!playerName.trim()}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold text-lg"
        >
          Create Game
        </button>
      </div>
    </div>
  );
}

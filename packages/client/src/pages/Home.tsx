import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { useGame } from "../contexts/GameContext";

export function Home() {
  const navigate = useNavigate();
  const { setPlayerId, setGameCode } = useGame();
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");

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

  function handleJoin() {
    if (!playerName.trim() || !joinCode.trim()) return;
    socket.connect();
    const code = joinCode.trim().toUpperCase();
    socket.emit("game:join", { gameCode: code, playerName: playerName.trim() });
    socket.once("game:joined", ({ playerId }: { playerId: string }) => {
      setPlayerId(playerId);
      setGameCode(code);
      navigate(`/lobby/${code}`);
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
        <div className="border-t border-gray-600 pt-4">
          <label className="block text-sm font-medium mb-1">Game Code</label>
          <input
            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-amber-400 focus:outline-none uppercase"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter game code"
          />
          <button
            onClick={handleJoin}
            disabled={!playerName.trim() || !joinCode.trim()}
            className="w-full mt-3 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold text-lg"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}

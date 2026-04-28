import { useNavigate } from "react-router-dom";
import { useGame } from "../contexts/GameContext";

interface GameOverResult {
  winnerId: string;
  winnerName: string;
  scores: { playerId: string; name: string; score: number; rackValue: number }[];
}

export function GameOver({ result }: { result: GameOverResult }) {
  const navigate = useNavigate();
  const { playerId } = useGame();
  const isWinner = playerId === result.winnerId;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-5xl font-bold text-amber-400">Game Over</h1>
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-4">
        <div className="text-center">
          <p className={`text-2xl font-bold ${isWinner ? "text-green-400" : "text-red-400"}`}>
            {isWinner ? "You Win!" : `${result.winnerName} Wins!`}
          </p>
        </div>
        <div className="border-t border-gray-600 pt-4 space-y-2">
          {result.scores.map((s) => (
            <div key={s.playerId} className="flex justify-between">
              <span className={s.playerId === result.winnerId ? "text-green-400 font-bold" : "text-gray-300"}>
                {s.name}
              </span>
              <span className={s.score > 0 ? "text-green-400" : "text-red-400"}>
                {s.score > 0 ? `+${s.score}` : s.score}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate("/")}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 rounded font-bold text-lg"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

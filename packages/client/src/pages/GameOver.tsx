import { useNavigate } from "react-router-dom";
import { useGame } from "../contexts/GameContext";
import { socket } from "../socket";

interface GameOverResult {
  winnerId: string;
  winnerName: string;
  scores: { playerId: string; name: string; score: number; rackValue: number }[];
  roundNumber: number;
  isStalemate: boolean;
  gamesWon: { playerId: string; gamesWon: number }[];
}

export function GameOver({ result }: { result: GameOverResult }) {
  const navigate = useNavigate();
  const { playerId, isSpectator } = useGame();
  const isWinner = playerId === result.winnerId;

  function handlePlayAgain() {
    socket.emit("game:playAgain", {});
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      {isSpectator && (
        <div className="bg-gray-800/50 px-4 py-1 rounded text-amber-400 text-sm">Spectating</div>
      )}
      <h1 className="text-5xl font-bold text-amber-400">Game Over</h1>
      {result.isStalemate && (
        <div className="text-yellow-400 font-bold">Stalemate — pool empty, all players passed</div>
      )}
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-4">
        <div className="text-center">
          <p className={`text-2xl font-bold ${isWinner ? "text-green-400" : "text-red-400"}`}>
            {isWinner ? "You Win!" : `${result.winnerName} Wins!`}
          </p>
        </div>
        {result.roundNumber > 1 && (
          <div className="text-center text-gray-400 text-sm">Round {result.roundNumber}</div>
        )}
        <div className="border-t border-gray-600 pt-4 space-y-2">
          {result.scores.map((s) => (
            <div key={s.playerId} className="flex justify-between">
              <span className={s.playerId === result.winnerId ? "text-green-400 font-bold" : "text-gray-300"}>
                {s.name}
              </span>
              <span className={s.score > 0 ? "text-green-400" : s.score < 0 ? "text-red-400" : "text-gray-400"}>
                {s.score > 0 ? `+${s.score}` : s.score}
              </span>
            </div>
          ))}
        </div>
        {result.gamesWon.length > 0 && (
          <div className="border-t border-gray-600 pt-4 space-y-1">
            <div className="text-center text-gray-400 text-xs">Games Won</div>
            {result.gamesWon.map((g) => {
              const name = result.scores.find((s) => s.playerId === g.playerId)?.name ?? "";
              return (
                <div key={g.playerId} className="flex justify-between text-sm">
                  <span className="text-gray-300">{name}</span>
                  <span className="text-amber-400 font-bold">{g.gamesWon}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-2 pt-2">
          <button
            onClick={handlePlayAgain}
            className="w-full py-3 bg-green-600 hover:bg-green-700 rounded font-bold text-lg"
          >
            Play Again
          </button>
          <button
            onClick={() => navigate("/")}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 rounded font-bold text-lg"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

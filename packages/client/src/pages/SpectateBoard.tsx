import { useGame } from "../contexts/GameContext";
import { Board, Pool } from "../components/GameBoard";

export function SpectateBoard() {
  const { spectatorState } = useGame();

  if (!spectatorState) return null;

  const { board, poolSize, currentTurnPlayerId, players, roundNumber, consecutivePasses } = spectatorState;
  const currentPlayer = players.find((p) => p.id === currentTurnPlayerId);

  const anyDisconnected = players.some((p) => !p.connected);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="text-center">
        <span className="bg-gray-800/50 px-4 py-1 rounded text-amber-400 text-sm">Spectating</span>
      </div>

      {anyDisconnected && (
        <div className="bg-yellow-600 text-white text-center py-2 rounded font-bold">
          Player disconnected — waiting for reconnection...
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${!p.connected ? "text-red-400" : "text-gray-400"}`}>{p.name}</span>
                {p.isAI && (
                  <span className="px-1.5 py-0.5 text-xs bg-indigo-700 text-indigo-100 rounded font-semibold">
                    {p.model ? `AI · ${p.model}` : "AI"}
                  </span>
                )}
              </div>
              {!p.connected && <span className="text-red-400 text-xs">(disconnected)</span>}
            </div>
          ))}
        </div>
        <Pool count={poolSize} />
      </div>

      <div className="text-sm text-gray-400">
        Round {roundNumber} · {players.map((p) => `${p.name}: ${p.score} pts`).join(" · ")}
        {players.some((p) => p.gamesWon > 0) && (
          <span> · Wins: {players.map((p) => `${p.name} ${p.gamesWon}`).join(", ")}</span>
        )}
      </div>

      <Board board={board} />

      {poolSize === 0 && <div className="text-center text-amber-400 text-sm">Pool empty</div>}
      {consecutivePasses > 0 && (
        <div className="text-center text-yellow-400 text-sm">{consecutivePasses} consecutive pass{consecutivePasses > 1 ? "es" : ""}</div>
      )}

      <div className="text-center text-gray-500 text-sm">
        {currentPlayer ? `${currentPlayer.name}'s turn` : ""}
      </div>
    </div>
  );
}

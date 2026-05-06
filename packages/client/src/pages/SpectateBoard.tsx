import { useEffect, useState } from "react";
import { useGame } from "../contexts/GameContext";
import { socket } from "../socket";
import { Board, Pool } from "../components/GameBoard";
import type { PlayerDisconnectedPayload, PlayerReconnectedPayload } from "@rummikub/shared";

export function SpectateBoard() {
  const { spectatorState } = useGame();
  const [opponentDisconnected, setOpponentDisconnected] = useState<string | null>(null);

  useEffect(() => {
    function onDisconnected(data: PlayerDisconnectedPayload) {
      setOpponentDisconnected(data.playerName);
    }
    function onReconnected(data: PlayerReconnectedPayload) {
      if (opponentDisconnected === data.playerName) {
        setOpponentDisconnected(null);
      }
    }
    socket.on("player:disconnected", onDisconnected);
    socket.on("player:reconnected", onReconnected);
    return () => {
      socket.off("player:disconnected", onDisconnected);
      socket.off("player:reconnected", onReconnected);
    };
  }, [opponentDisconnected]);

  if (!spectatorState) return null;

  const { board, poolSize, currentTurnPlayerId, players, roundNumber, consecutivePasses } = spectatorState;
  const currentPlayer = players.find((p) => p.id === currentTurnPlayerId);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="text-center">
        <span className="bg-gray-800/50 px-4 py-1 rounded text-amber-400 text-sm">Spectating</span>
      </div>

      {opponentDisconnected && (
        <div className="bg-yellow-600 text-white text-center py-2 rounded font-bold">
          {opponentDisconnected} disconnected — waiting for reconnection...
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg">
              <span className={`text-sm ${!p.connected ? "text-red-400" : "text-gray-400"}`}>{p.name}</span>
              {!p.connected && <span className="text-red-400 text-xs">(disconnected)</span>}
            </div>
          ))}
        </div>
        <Pool count={poolSize} />
      </div>

      <div className="text-sm text-gray-400">
        Round {roundNumber} · {players[0]?.name}: {players[0]?.score} pts · {players[1]?.name}: {players[1]?.score} pts
        {(players[0]?.gamesWon > 0 || players[1]?.gamesWon > 0) && (
          <span> · Wins: {players[0]?.gamesWon}–{players[1]?.gamesWon}</span>
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

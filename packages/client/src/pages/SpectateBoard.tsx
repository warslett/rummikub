import { useEffect, useState } from "react";
import { useGame } from "../contexts/GameContext";
import { socket } from "../socket";
import { Board, Pool, OpponentInfo } from "../components/GameBoard";
import type { GameEndedPayload, PlayerDisconnectedPayload, PlayerReconnectedPayload } from "@rummikub/shared";

export function SpectateBoard() {
  const { spectatorState } = useGame();
  const [opponentDisconnected, setOpponentDisconnected] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<GameEndedPayload | null>(null);

  useEffect(() => {
    function onDisconnected(data: PlayerDisconnectedPayload) {
      setOpponentDisconnected(data.playerName);
    }
    function onReconnected(data: PlayerReconnectedPayload) {
      if (opponentDisconnected === data.playerName) {
        setOpponentDisconnected(null);
      }
    }
    function onGameEnded(data: GameEndedPayload) {
      setGameEnded(data);
    }
    socket.on("player:disconnected", onDisconnected);
    socket.on("player:reconnected", onReconnected);
    socket.on("game:ended", onGameEnded);
    return () => {
      socket.off("player:disconnected", onDisconnected);
      socket.off("player:reconnected", onReconnected);
      socket.off("game:ended", onGameEnded);
    };
  }, [opponentDisconnected]);

  if (!spectatorState) return null;

  const { board, poolSize, currentTurnPlayerId, players, roundNumber, consecutivePasses } = spectatorState;
  const currentPlayer = players.find((p) => p.id === currentTurnPlayerId);

  if (gameEnded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div className="bg-gray-800/50 px-4 py-1 rounded text-amber-400 text-sm">Spectating</div>
        <h1 className="text-5xl font-bold text-amber-400">Game Over</h1>
        {gameEnded.isStalemate && (
          <div className="text-yellow-400 font-bold">Stalemate — pool empty, both players passed</div>
        )}
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-96 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{gameEnded.winnerName} Wins!</p>
          </div>
          {gameEnded.roundNumber > 1 && (
            <div className="text-center text-gray-400 text-sm">Round {gameEnded.roundNumber}</div>
          )}
          <div className="border-t border-gray-600 pt-4 space-y-2">
            {gameEnded.scores.map((s: { playerId: string; name: string; score: number; rackValue: number }) => (
              <div key={s.playerId} className="flex justify-between">
                <span className={s.playerId === gameEnded.winnerId ? "text-green-400 font-bold" : "text-gray-300"}>
                  {s.name}
                </span>
                <span className={s.score > 0 ? "text-green-400" : s.score < 0 ? "text-red-400" : "text-gray-400"}>
                  {s.score > 0 ? `+${s.score}` : s.score}
                </span>
              </div>
            ))}
          </div>
          {gameEnded.gamesWon.length > 0 && (
            <div className="border-t border-gray-600 pt-4 space-y-1">
              <div className="text-center text-gray-400 text-xs">Games Won</div>
              {gameEnded.gamesWon.map((g) => {
                const name = gameEnded.scores.find((s) => s.playerId === g.playerId)?.name ?? "";
                return (
                  <div key={g.playerId} className="flex justify-between text-sm">
                    <span className="text-gray-300">{name}</span>
                    <span className="text-amber-400 font-bold">{g.gamesWon}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

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
            <OpponentInfo
              key={p.id}
              name={p.name}
              rackSize={p.rackSize}
              disconnected={!p.connected}
            />
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

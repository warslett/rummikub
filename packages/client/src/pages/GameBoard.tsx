import { useState, useEffect, useRef } from "react";
import { useGame } from "../contexts/GameContext";
import { socket } from "../socket";
import { Board, Rack, Pool, OpponentInfo, Controls } from "../components/GameBoard";
import { isValidSet, isValidGroup } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";

export function GameBoard() {
  const { gameState, playerId } = useGame();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasPlayedThisTurn, setHasPlayedThisTurn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevIsYourTurn = useRef(gameState?.isYourTurn);

  useEffect(() => {
    if (!gameState) return;
    if (prevIsYourTurn.current && !gameState.isYourTurn) {
      setHasPlayedThisTurn(false);
      setError(null);
    }
    prevIsYourTurn.current = gameState.isYourTurn;
  }, [gameState?.isYourTurn]);

  if (!gameState || !playerId) return null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setError(null);
  }

  function handlePlay() {
    if (!gameState) return;
    const selectedTiles = gameState.yourRack.filter((t) => selectedIds.has(t.id));

    if (selectedTiles.length < 3) return;

    const sortedByColor = [...selectedTiles].sort((a, b) => {
      if (a.color !== b.color) return a.color.localeCompare(b.color);
      return a.value - b.value;
    });

    const sets: TileSet[] = [];
    let current: Tile[] = [sortedByColor[0]];

    for (let i = 1; i < sortedByColor.length; i++) {
      const tile = sortedByColor[i];
      const prev = current[current.length - 1];

      if (tile.color === prev.color && tile.value === prev.value + 1) {
        current.push(tile);
      } else {
        if (isValidSet(current)) {
          sets.push({ id: `pending-${sets.length}`, tiles: [...current] });
        }
        current = [tile];
      }
    }
    if (isValidSet(current)) {
      sets.push({ id: `pending-${sets.length}`, tiles: [...current] });
    }

    if (sets.length === 0) {
      const valueGroups = new Map<number, Tile[]>();
      for (const t of selectedTiles) {
        if (!valueGroups.has(t.value)) valueGroups.set(t.value, []);
        valueGroups.get(t.value)!.push(t);
      }
      for (const [, tiles] of valueGroups) {
        if (isValidGroup(tiles)) {
          sets.push({ id: `pending-${sets.length}`, tiles });
        }
      }
    }

    if (sets.length === 0) {
      setError("Selected tiles don't form a valid set");
      return;
    }

    socket.emit("turn:play", { actions: { sets } });
    setHasPlayedThisTurn(true);
    setSelectedIds(new Set());
    setError(null);
  }

  function handleEndTurn() {
    socket.emit("turn:end", {});
  }

  function handleDraw() {
    socket.emit("turn:draw", {});
    setHasPlayedThisTurn(false);
    setSelectedIds(new Set());
    setError(null);
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center">
        <OpponentInfo name={gameState.opponentName} rackSize={gameState.opponentRackSize} />
        <Pool count={gameState.poolSize} />
      </div>

      <Board board={gameState.board} />

      {gameState.isYourTurn && !gameState.hasInitialMeld && (
        <div className="text-center text-amber-400 text-sm">
          Initial meld: first play must total 30+ points
        </div>
      )}

      {error && (
        <div className="text-center text-red-400 text-sm">{error}</div>
      )}

      <Controls
        isYourTurn={gameState.isYourTurn}
        selectedCount={selectedIds.size}
        hasPlayedThisTurn={hasPlayedThisTurn}
        onPlay={handlePlay}
        onEndTurn={handleEndTurn}
        onDraw={handleDraw}
      />

      <Rack tiles={gameState.yourRack} selectedIds={selectedIds} onToggleSelect={toggleSelect} />

      <div className="text-center text-gray-500 text-sm">
        {gameState.isYourTurn ? "Your turn" : `${gameState.opponentName}'s turn`}
      </div>
    </div>
  );
}

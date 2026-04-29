import { useState, useEffect, useRef } from "react";
import { useGame } from "../contexts/GameContext";
import { socket } from "../socket";
import { Board, Rack, Pool, OpponentInfo, Controls } from "../components/GameBoard";
import { isValidBoard, formSetsFromTiles, JOKER_COLOR } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";

function isJoker(tile: Tile): boolean {
  return tile.color === JOKER_COLOR;
}

function wasJokerRetrieved(oldBoard: TileSet[], newBoard: TileSet[]): boolean {
  const oldJokerSets = new Map<string, Set<string>>();
  for (const set of oldBoard) {
    for (const tile of set.tiles) {
      if (isJoker(tile)) {
        const siblingIds = set.tiles.filter((t) => t.id !== tile.id).map((t) => t.id);
        oldJokerSets.set(tile.id, new Set(siblingIds));
      }
    }
  }
  const newJokerSets = new Map<string, Set<string>>();
  for (const set of newBoard) {
    for (const tile of set.tiles) {
      if (isJoker(tile)) {
        const siblingIds = set.tiles.filter((t) => t.id !== tile.id).map((t) => t.id);
        newJokerSets.set(tile.id, new Set(siblingIds));
      }
    }
  }
  for (const [jokerId, oldSiblings] of oldJokerSets) {
    const newSiblings = newJokerSets.get(jokerId);
    if (!newSiblings) return true;
    if (oldSiblings.size !== newSiblings.size) return true;
    for (const id of oldSiblings) {
      if (!newSiblings.has(id)) return true;
    }
  }
  return false;
}

function generateSetId(): string {
  return `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function GameBoard() {
  const { gameState, playerId } = useGame();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workingBoard, setWorkingBoard] = useState<TileSet[] | null>(null);
  const [workingRack, setWorkingRack] = useState<Tile[] | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const prevIsYourTurn = useRef(gameState?.isYourTurn);

  const isYourTurn = gameState?.isYourTurn ?? false;
  const serverBoard = gameState?.board ?? [];
  const serverRack = gameState?.yourRack ?? [];
  const canManipulate = gameState?.hasInitialMeld ?? false;
  const serverHasPlayedThisTurn = gameState?.hasPlayedThisTurn ?? false;

  const board = workingBoard ?? serverBoard;
  const rack = workingRack ?? serverRack;
  const hasChanges = workingBoard !== null;
  const hasPlayedThisTurn = serverHasPlayedThisTurn || hasChanges;

  useEffect(() => {
    if (!gameState) return;
    if (prevIsYourTurn.current && !gameState.isYourTurn) {
      setWorkingBoard(null);
      setWorkingRack(null);
      setSelectedIds(new Set());
      setSelectedTileId(null);
      setError(null);
    }
    prevIsYourTurn.current = gameState.isYourTurn;
  }, [gameState?.isYourTurn]);

  useEffect(() => {
    function onDisconnected() {
      setOpponentDisconnected(true);
    }
    function onReconnected() {
      setOpponentDisconnected(false);
    }
    socket.on("player:disconnected", onDisconnected);
    socket.on("player:reconnected", onReconnected);
    return () => {
      socket.off("player:disconnected", onDisconnected);
      socket.off("player:reconnected", onReconnected);
    };
  }, []);

  if (!gameState || !playerId) return null;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedTileId(null);
    setError(null);
  }

  function handlePlay() {
    const selectedTiles = rack.filter((t) => selectedIds.has(t.id));
    if (selectedTiles.length < 3) {
      setError("Select at least 3 tiles to form a set");
      return;
    }

    ensureWorkingCopy();
    const wb = workingBoard ?? structuredClone(serverBoard);
    const wr = workingRack ?? structuredClone(serverRack);

    const sets = formSetsFromTiles(selectedTiles);

    if (sets.length === 0) {
      setError("Selected tiles don't form a valid set");
      return;
    }

    const playedIds = new Set(sets.flatMap((s) => s.tiles.map((t) => t.id)));
    setWorkingRack(wr.filter((t) => !playedIds.has(t.id)));
    setWorkingBoard([...wb, ...sets]);
    setSelectedIds(new Set());
  }

  function ensureWorkingCopy() {
    if (workingBoard === null) {
      setWorkingBoard(structuredClone(serverBoard));
      setWorkingRack(structuredClone(serverRack));
    }
  }

  function handleBoardTileClick(tileId: string) {
    if (!isYourTurn || !canManipulate) return;

    if (selectedIds.size === 1) {
      const selectedId = Array.from(selectedIds)[0];
      const tile = findTileInRack(selectedId);
      if (tile) {
        placeTileOnBoard(tile, tileId);
        setSelectedIds(new Set());
        return;
      }
    }

    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    }

    const selectedTile = selectedTileId ? findTileAnywhere(selectedTileId) : null;
    if (selectedTile) {
      placeTileOnBoard(selectedTile, tileId);
    } else {
      setSelectedTileId((prev) => (prev === tileId ? null : tileId));
    }
    setError(null);
  }

  function handleBoardEmptyClick() {
    if (!isYourTurn || !canManipulate) return;
    if (selectedIds.size === 1) {
      const selectedId = Array.from(selectedIds)[0];
      const tile = findTileInRack(selectedId);
      if (tile) {
        startNewSetWithTile(tile);
        setSelectedIds(new Set());
        return;
      }
    }
    if (selectedTileId) {
      const selectedTile = findTileInRack(selectedTileId);
      if (selectedTile) startNewSetWithTile(selectedTile);
    }
  }

  function handleRackTileClick(tileId: string) {
    if (!isYourTurn) return;
    if (canManipulate && selectedTileId) {
      const selectedOnBoard = findTileOnBoard(selectedTileId);
      if (selectedOnBoard) {
        moveBoardTileToRack(selectedTileId);
        return;
      }
    }
    toggleSelect(tileId);
  }

  function findTileAnywhere(id: string | null): Tile | null {
    if (!id) return null;
    return findTileInRack(id) ?? findTileOnBoard(id);
  }

  function findTileInRack(id: string): Tile | null {
    return rack.find((t) => t.id === id) ?? null;
  }

  function findTileOnBoard(id: string): Tile | null {
    for (const set of board) {
      const found = set.tiles.find((t) => t.id === id);
      if (found) return found;
    }
    return null;
  }

  function placeTileOnBoard(tile: Tile, targetTileId: string) {
    ensureWorkingCopy();
    const wb = workingBoard ?? structuredClone(serverBoard);
    const wr = workingRack ?? structuredClone(serverRack);

    let targetSetIndex = -1;
    let targetTileIndex = -1;
    for (let si = 0; si < wb.length; si++) {
      const ti = wb[si].tiles.findIndex((t) => t.id === targetTileId);
      if (ti !== -1) { targetSetIndex = si; targetTileIndex = ti; break; }
    }
    if (targetSetIndex === -1) return;

    const isInRack = wr.some((t) => t.id === tile.id);
    if (isInRack) {
      setWorkingRack(wr.filter((t) => t.id !== tile.id));
    } else {
      for (const set of wb) { set.tiles = set.tiles.filter((t) => t.id !== tile.id); }
      wb.forEach((set, i) => { if (set.tiles.length === 0) wb.splice(i, 1); });
    }

    wb[targetSetIndex].tiles.splice(targetTileIndex + 1, 0, tile);
    setWorkingBoard([...wb]);
    setSelectedTileId(null);
  }

  function startNewSetWithTile(tile: Tile) {
    ensureWorkingCopy();
    const wb = workingBoard ?? structuredClone(serverBoard);
    const wr = workingRack ?? structuredClone(serverRack);

    const isInRack = wr.some((t) => t.id === tile.id);
    if (isInRack) {
      setWorkingRack(wr.filter((t) => t.id !== tile.id));
    } else {
      for (const set of wb) { set.tiles = set.tiles.filter((t) => t.id !== tile.id); }
    }

    wb.push({ id: generateSetId(), tiles: [tile] });
    setWorkingBoard([...wb]);
    setSelectedTileId(null);
  }

  function moveBoardTileToRack(tileId: string) {
    ensureWorkingCopy();
    const wb = workingBoard ?? structuredClone(serverBoard);
    const wr = workingRack ?? structuredClone(serverRack);

    let tile: Tile | null = null;
    for (const set of wb) {
      const found = set.tiles.find((t) => t.id === tileId);
      if (found) { tile = found; set.tiles = set.tiles.filter((t) => t.id !== tileId); break; }
    }
    if (!tile) return;

    wr.push(tile);
    setWorkingBoard(wb.filter((s) => s.tiles.length > 0));
    setWorkingRack(wr);
    setSelectedTileId(null);
  }

  function handleEndTurn() {
    if (hasChanges && workingBoard) {
      if (!isValidBoard(workingBoard)) {
        setError("Board has invalid sets. Fix or undo before ending turn.");
        return;
      }

      if (!canManipulate) {
        const serverBoardTileIds = new Set(serverBoard.flatMap((s) => s.tiles.map((t) => t.id)));
        const workingBoardTileIds = new Set(workingBoard.flatMap((s) => s.tiles.map((t) => t.id)));
        for (const id of serverBoardTileIds) {
          if (!workingBoardTileIds.has(id)) {
            setError("Cannot modify existing sets before making initial meld");
            return;
          }
        }

        const newSets = workingBoard.filter(
          (ws) => !serverBoard.some((ss) => ss.id === ws.id)
        );

        socket.emit("turn:play", { actions: { sets: newSets } });
        socket.emit("turn:end", {});
        setWorkingBoard(null);
        setWorkingRack(null);
      } else {
        const oldBoardTileIds = new Set(serverBoard.flatMap((s) => s.tiles.map((t) => t.id)));
        const newBoardTileIds = new Set(workingBoard.flatMap((s) => s.tiles.map((t) => t.id)));
        const jokersOnOldBoard = serverBoard.flatMap((s) => s.tiles).filter(isJoker);
        const jokersOnNewBoard = workingBoard.flatMap((s) => s.tiles).filter(isJoker);
        const freedJokers = jokersOnOldBoard.filter((j) => !newBoardTileIds.has(j.id));

        if (freedJokers.length > 0) {
          const usedJokerIds = new Set(jokersOnNewBoard.map((t) => t.id));
          for (const freedJoker of freedJokers) {
            if (!usedJokerIds.has(freedJoker.id)) {
              setError("Freed joker must be used in the same turn");
              return;
            }
          }
        }

        if (wasJokerRetrieved(serverBoard, workingBoard)) {
          const rackTilesOnNewBoard = newBoardTileIds.size - oldBoardTileIds.size;
          if (rackTilesOnNewBoard <= 0) {
            setError("Must play at least one rack tile when retrieving a joker");
            return;
          }
        }

        socket.emit("turn:end", { newBoard: workingBoard });
        setWorkingBoard(null);
        setWorkingRack(null);
      }
    } else {
      socket.emit("turn:end", {});
    }
    setSelectedIds(new Set());
    setSelectedTileId(null);
    setError(null);
  }

  function handleUndo() {
    setWorkingBoard(null);
    setWorkingRack(null);
    setSelectedTileId(null);
    setSelectedIds(new Set());
    setError(null);
  }

  function handleDraw() {
    socket.emit("turn:draw", {});
    setWorkingBoard(null);
    setWorkingRack(null);
    setSelectedIds(new Set());
    setSelectedTileId(null);
    setError(null);
  }

  function handlePass() {
    socket.emit("turn:pass", {});
    setWorkingBoard(null);
    setWorkingRack(null);
    setSelectedIds(new Set());
    setSelectedTileId(null);
    setError(null);
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {opponentDisconnected && (
        <div className="bg-yellow-600 text-white text-center py-2 rounded font-bold">
          Opponent disconnected — waiting for reconnection...
        </div>
      )}

      <div className="flex justify-between items-center">
        <OpponentInfo
          name={gameState.opponentName}
          rackSize={gameState.opponentRackSize}
          disconnected={opponentDisconnected}
        />
        <Pool count={gameState.poolSize} />
      </div>

      <div className="text-sm text-gray-400">
        Round {gameState.roundNumber} · You: {gameState.yourScore} pts · {gameState.opponentName}: {gameState.opponentScore} pts
        {(gameState.yourGamesWon > 0 || gameState.opponentGamesWon > 0) && (
          <span> · Wins: {gameState.yourGamesWon}–{gameState.opponentGamesWon}</span>
        )}
      </div>

      <Board
        board={board}
        isEditable={isYourTurn && canManipulate}
        selectedTileId={selectedTileId}
        onTileClick={handleBoardTileClick}
        onEmptyClick={handleBoardEmptyClick}
      />

      {isYourTurn && !canManipulate && !hasPlayedThisTurn && (
        <div className="text-center text-amber-400 text-sm">
          Initial meld: first play must total 30+ points
        </div>
      )}

      {gameState.poolSize === 0 && isYourTurn && (
        <div className="text-center text-amber-400 text-sm">
          Pool empty — you may pass or play
        </div>
      )}

      {error && <div className="text-center text-red-400 text-sm">{error}</div>}

      <Controls
        isYourTurn={isYourTurn}
        selectedCount={selectedIds.size}
        hasPlayedThisTurn={hasPlayedThisTurn}
        hasChanges={hasChanges}
        poolSize={gameState.poolSize}
        onPlay={handlePlay}
        onUndo={handleUndo}
        onEndTurn={handleEndTurn}
        onDraw={handleDraw}
        onPass={handlePass}
        opponentDisconnected={opponentDisconnected}
      />

      <Rack
        tiles={rack}
        selectedIds={selectedIds}
        onTileClick={handleRackTileClick}
      />

      <div className="text-center text-gray-500 text-sm">
        {isYourTurn
          ? canManipulate
            ? "Your turn — select and place tiles, or manipulate the board"
            : hasPlayedThisTurn
              ? "Your turn — play more tiles or end your turn"
              : "Your turn — select tiles from your rack and play"
          : `${gameState.opponentName}'s turn`}
      </div>
    </div>
  );
}

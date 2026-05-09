import { resolveJokerValue, isValidSet } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";

const TILE_COLORS: Record<string, string> = {
  red: "bg-red-600",
  blue: "bg-blue-600",
  orange: "bg-orange-500",
  black: "bg-gray-900 border-gray-400",
  joker: "bg-gradient-to-br from-red-500 via-blue-500 to-green-500",
};

export function TileComponent({
  tile,
  selected,
  onClick,
  displayValue,
}: {
  tile: Tile;
  selected: boolean;
  onClick: () => void;
  displayValue?: string;
}) {
  const bg = TILE_COLORS[tile.color] ?? "bg-gray-500";
  const isJokerTile = tile.color === "joker";
  const label = isJokerTile ? (displayValue ?? "★") : String(tile.value);

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-10 h-14 rounded-md font-bold text-lg shadow-md cursor-pointer select-none
        ${bg} ${selected ? "ring-2 ring-amber-400 scale-105" : "hover:brightness-110"}`}
    >
      {label}
    </button>
  );
}

function getJokerDisplayValue(tile: Tile, setTiles: Tile[]): string | undefined {
  if (tile.color !== "joker") return undefined;
  if (!isValidSet(setTiles)) return "★";
  const resolved = resolveJokerValue(tile, setTiles);
  return resolved > 0 ? String(resolved) : "★";
}

export function TileSetComponent({
  tileSet,
  selectedTileId,
  onTileClick,
  validationError,
}: {
  tileSet: TileSet;
  selectedTileId?: string | null;
  onTileClick?: (tileId: string) => void;
  validationError?: string | null;
}) {
  return (
    <div className={`relative flex flex-wrap gap-1 p-2 rounded group ${
      validationError ? "ring-2 ring-red-500 bg-red-900/30" : "bg-gray-700/50"
    }`}>
      {tileSet.tiles.map((tile) => (
        <TileComponent
          key={tile.id}
          tile={tile}
          selected={selectedTileId === tile.id}
          onClick={() => onTileClick?.(tile.id)}
          displayValue={getJokerDisplayValue(tile, tileSet.tiles)}
        />
      ))}
      {validationError && (
        <div
          role="tooltip"
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-red-900 text-red-200 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none max-w-xs text-center"
        >
          {validationError}
        </div>
      )}
    </div>
  );
}

export function Board({
  board,
  isEditable,
  selectedTileId,
  onTileClick,
  onEmptyClick,
  validationErrors,
}: {
  board: TileSet[];
  isEditable?: boolean;
  selectedTileId?: string | null;
  onTileClick?: (tileId: string) => void;
  onEmptyClick?: () => void;
  validationErrors?: Map<string, string>;
}) {
  return (
    <div
      className="flex flex-wrap gap-2 p-4 min-h-48 bg-green-900/40 rounded-lg border border-green-700/30 cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onEmptyClick?.();
      }}
    >
      {board.length === 0 && (
        <p className="text-gray-500 italic">
          {isEditable ? "Click to place tiles on the board" : "No tiles on the board yet"}
        </p>
      )}
      {board.map((set) => (
        <TileSetComponent
          key={set.id}
          tileSet={set}
          selectedTileId={selectedTileId}
          onTileClick={onTileClick}
          validationError={validationErrors?.get(set.id)}
        />
      ))}
    </div>
  );
}

export function Rack({
  tiles,
  selectedIds,
  onTileClick,
}: {
  tiles: Tile[];
  selectedIds: Set<string>;
  onTileClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-3 bg-gray-800 rounded-lg">
      {tiles.map((tile) => {
        const isSelected = selectedIds.has(tile.id);
        return (
          <TileComponent
            key={tile.id}
            tile={tile}
            selected={isSelected}
            onClick={() => onTileClick(tile.id)}
            displayValue={tile.color === "joker" ? "★" : undefined}
          />
        );
      })}
    </div>
  );
}

export function Pool({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
      <span className="text-gray-400 text-sm">Pool:</span>
      <span className="font-bold text-amber-400">{count}</span>
    </div>
  );
}

export function OpponentInfo({
  name,
  rackSize,
  disconnected,
}: {
  name: string;
  rackSize: number;
  disconnected?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg">
      <span className={`text-sm ${disconnected ? "text-red-400" : "text-gray-400"}`}>{name}</span>
      <span className="text-gray-500">|</span>
      <span className="text-gray-400 text-sm">{rackSize} tiles</span>
      {disconnected && <span className="text-red-400 text-xs">(disconnected)</span>}
    </div>
  );
}

export function Controls({
  isYourTurn,
  selectedCount,
  hasPlayedThisTurn,
  hasChanges,
  poolSize,
  onPlay,
  onUndo,
  onEndTurn,
  onDraw,
  onPass,
  allOpponentsDisconnected,
}: {
  isYourTurn: boolean;
  selectedCount: number;
  hasPlayedThisTurn: boolean;
  hasChanges: boolean;
  poolSize: number;
  onPlay: () => void;
  onUndo: () => void;
  onEndTurn: () => void;
  onDraw: () => void;
  onPass: () => void;
  allOpponentsDisconnected?: boolean;
}) {
  if (!isYourTurn) {
    return <div className="text-center text-gray-500 py-2">Waiting for other players...</div>;
  }
  return (
    <div className="flex gap-3 justify-center py-2 flex-wrap">
      <button
        onClick={onPlay}
        disabled={selectedCount < 3 || allOpponentsDisconnected}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        Play Selected ({selectedCount})
      </button>
      {hasChanges && (
        <button
          onClick={onUndo}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
        >
          Undo
        </button>
      )}
      <button
        onClick={onEndTurn}
        disabled={!hasPlayedThisTurn || allOpponentsDisconnected}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        End Turn
      </button>
      <button
        onClick={onDraw}
        disabled={hasPlayedThisTurn || poolSize === 0 || allOpponentsDisconnected}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        Draw Tile
      </button>
      {poolSize === 0 && (
        <button
          onClick={onPass}
          disabled={hasPlayedThisTurn || allOpponentsDisconnected}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
        >
          Pass
        </button>
      )}
    </div>
  );
}

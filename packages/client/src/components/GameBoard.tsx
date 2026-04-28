import type { Tile, TileSet } from "@rummikub/shared";

const TILE_COLORS: Record<string, string> = {
  red: "bg-red-600",
  blue: "bg-blue-600",
  orange: "bg-orange-500",
  black: "bg-gray-900 border-gray-400",
};

export function TileComponent({ tile, selected, onClick }: { tile: Tile; selected: boolean; onClick: () => void }) {
  const bg = TILE_COLORS[tile.color] ?? "bg-gray-500";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-10 h-14 rounded-md font-bold text-lg shadow-md cursor-pointer select-none
        ${bg} ${selected ? "ring-2 ring-amber-400 scale-105" : "hover:brightness-110"}`}
    >
      {tile.value}
    </button>
  );
}

export function TileSetComponent({ tileSet }: { tileSet: TileSet }) {
  return (
    <div className="flex gap-1 p-2 bg-gray-700/50 rounded">
      {tileSet.tiles.map((tile) => (
        <TileComponent key={tile.id} tile={tile} selected={false} onClick={() => {}} />
      ))}
    </div>
  );
}

export function Board({ board }: { board: TileSet[] }) {
  return (
    <div className="flex flex-wrap gap-2 p-4 min-h-48 bg-green-900/40 rounded-lg border border-green-700/30">
      {board.length === 0 && (
        <p className="text-gray-500 italic">No tiles on the board yet</p>
      )}
      {board.map((set) => (
        <TileSetComponent key={set.id} tileSet={set} />
      ))}
    </div>
  );
}

export function Rack({
  tiles,
  selectedIds,
  onToggleSelect,
}: {
  tiles: Tile[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-3 bg-gray-800 rounded-lg">
      {tiles.map((tile) => (
        <TileComponent
          key={tile.id}
          tile={tile}
          selected={selectedIds.has(tile.id)}
          onClick={() => onToggleSelect(tile.id)}
        />
      ))}
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

export function OpponentInfo({ name, rackSize }: { name: string; rackSize: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg">
      <span className="text-gray-400 text-sm">{name}</span>
      <span className="text-gray-500">|</span>
      <span className="text-gray-400 text-sm">{rackSize} tiles</span>
    </div>
  );
}

export function Controls({
  isYourTurn,
  selectedCount,
  hasPlayedThisTurn,
  onPlay,
  onEndTurn,
  onDraw,
}: {
  isYourTurn: boolean;
  selectedCount: number;
  hasPlayedThisTurn: boolean;
  onPlay: () => void;
  onEndTurn: () => void;
  onDraw: () => void;
}) {
  if (!isYourTurn) {
    return <div className="text-center text-gray-500 py-2">Waiting for opponent...</div>;
  }
  return (
    <div className="flex gap-3 justify-center py-2">
      <button
        onClick={onPlay}
        disabled={selectedCount < 3}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        Play Selected ({selectedCount})
      </button>
      <button
        onClick={onEndTurn}
        disabled={!hasPlayedThisTurn}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        End Turn
      </button>
      <button
        onClick={onDraw}
        disabled={hasPlayedThisTurn}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
      >
        Draw Tile
      </button>
    </div>
  );
}

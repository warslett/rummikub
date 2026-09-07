import { resolveJokerValue, isValidSet } from "@rummikub/shared";
import type { Tile, TileSet } from "@rummikub/shared";
import { TileSvg } from "./TileSvg";

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
  const isJokerTile = tile.color === "joker";

  return (
    <button
      onClick={onClick}
      aria-label={isJokerTile ? "Joker" : `${tile.color} ${tile.value}`}
      className={`inline-flex items-center justify-center w-[50px] h-[70px] rounded-md cursor-pointer select-none transition-transform ${selected ? "ring-2 ring-amber-400 scale-105 z-10" : "hover:scale-[1.02]"}`}
    >
      <TileSvg color={tile.color} value={tile.value} displayValue={displayValue} />
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
    <div className={`relative flex flex-wrap gap-2 p-3 rounded-lg group ${validationError ? "ring-2 ring-red-500 bg-red-900/40" : "bg-black/20"}`}>
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
      className="flex flex-wrap gap-3 p-5 min-h-[200px] bg-[#0F3815] rounded-xl border border-[#1A5C25] shadow-inner cursor-pointer"
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
    <div className="flex flex-wrap gap-2 p-4 bg-[#2C1810] rounded-lg border-t-4 border-[#1A0F08] shadow-inner">
      {tiles.map((tile) => {
        const isSelected = selectedIds.has(tile.id);
        return (
          <TileComponent
            key={tile.id}
            tile={tile}
            selected={isSelected}
            onClick={() => onTileClick(tile.id)}
            displayValue={undefined}
          />
        );
      })}
    </div>
  );
}

export function Pool({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1C1C1C] rounded-lg border border-[#333333]">
      <span className="text-gray-400 text-sm">Pool:</span>
      <span className="font-bold text-amber-400">{count}</span>
    </div>
  );
}

export function OpponentInfo({
  name,
  rackSize,
  disconnected,
  isAI,
  model,
  debugClickable,
  onDebugClick,
}: {
  name: string;
  rackSize: number;
  disconnected?: boolean;
  isAI?: boolean;
  model?: string;
  debugClickable?: boolean;
  onDebugClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className={`text-sm ${disconnected ? "text-red-400" : "text-gray-400"}`}>{name}</span>
        {isAI && (
          <span className="px-1.5 py-0.5 text-xs bg-indigo-700 text-indigo-100 rounded font-semibold">
            {model ? `AI · ${model}` : "AI"}
          </span>
        )}
      </div>
      <span className="text-gray-500">|</span>
      <span className="text-gray-400 text-sm">{rackSize} tiles</span>
      {disconnected && <span className="text-red-400 text-xs">(disconnected)</span>}
    </>
  );

  if (debugClickable) {
    return (
      <button
        type="button"
        data-testid="ai-debug-player"
        onClick={onDebugClick}
        className="flex items-center gap-3 px-3 py-2 bg-[#1C1C1C] rounded-lg border border-[#333333] cursor-pointer hover:border-amber-400 transition-colors text-left"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#1C1C1C] rounded-lg border border-[#333333]">
      {content}
    </div>
  );
}

export function Controls({
  isYourTurn,
  isAiTurn,
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
  isAiTurn?: boolean;
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
    return (
      <div className="text-center text-gray-500 py-2">
        {isAiTurn ? "AI is thinking..." : "Waiting for other players..."}
      </div>
    );
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

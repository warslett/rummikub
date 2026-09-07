import { useEffect, useRef } from "react";
import { useAiDebug, isNearBottom } from "../contexts/AiDebugContext";
import { TileComponent } from "./GameBoard";
import type { AiDebugItem } from "@rummikub/shared";

const ITEM_STYLES: Record<AiDebugItem["type"], string> = {
  prompt: "bg-blue-900/40 border border-blue-700 rounded-lg px-3 py-2 text-left",
  thinking: "bg-transparent border border-gray-700 rounded-lg px-3 py-2 text-left italic",
  tool_call: "bg-amber-900/40 border border-amber-600 rounded-full px-3 py-1 text-left font-mono text-sm self-start",
  response: "bg-green-900/40 border border-green-700 rounded-lg px-3 py-2 text-left",
};

const ITEM_LABELS: Record<AiDebugItem["type"], string> = {
  prompt: "Prompt",
  thinking: "Thinking",
  tool_call: "Tool call",
  response: "Response",
};

function AiDebugItemView({ item }: { item: AiDebugItem }) {
  return (
    <div data-item-type={item.type} className={`flex flex-col gap-1 ${ITEM_STYLES[item.type]}`}>
      {item.type === "tool_call" ? (
        <span className="text-amber-300 text-xs font-semibold">{`${ITEM_LABELS[item.type]}: `}
          <code className="font-mono">{item.text}</code>
        </span>
      ) : (
        <>
          <span
            className={`text-xs font-semibold uppercase tracking-wide ${
              item.type === "prompt"
                ? "text-blue-300"
                : item.type === "thinking"
                  ? "text-gray-500"
                  : "text-green-300"
            }`}
          >
            {ITEM_LABELS[item.type]}
          </span>
          <p
            className={`text-sm whitespace-pre-wrap break-words ${
              item.type === "thinking" ? "text-gray-400" : "text-gray-100"
            }`}
          >
            {item.text}
          </p>
        </>
      )}
    </div>
  );
}

export function AiDebugConsole({ playerName, model }: { playerName: string; model?: string }) {
  const { transcripts, racks, openPlayerId, closeConsole, requestHistory, historyRequested } = useAiDebug();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const items = openPlayerId ? transcripts[openPlayerId] ?? [] : [];
  const rack = openPlayerId ? racks[openPlayerId] ?? [] : [];

  useEffect(() => {
    isAtBottomRef.current = true;
  }, [openPlayerId]);

  useEffect(() => {
    if (!openPlayerId || historyRequested.has(openPlayerId)) {
      return;
    }
    requestHistory(openPlayerId);
  }, [openPlayerId, historyRequested, requestHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items.length]);

  if (!openPlayerId) {
    return null;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (el) {
      isAtBottomRef.current = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
    }
  }

  return (
    <div
      data-testid="ai-debug-console"
      className="fixed z-50 bottom-0 right-0 sm:bottom-4 sm:right-4 w-full sm:w-[440px] max-h-[75vh] flex flex-col bg-gray-800 border border-gray-600 rounded-t-lg sm:rounded-lg shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-900 border-b border-gray-600 rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold truncate">{playerName}</span>
          {model && (
            <span className="px-1.5 py-0.5 text-xs bg-indigo-700 text-indigo-100 rounded font-semibold">
              {model}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={closeConsole}
          className="px-2 py-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded font-bold"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-700">
        <div className="text-xs text-gray-400 mb-1">Rack ({rack.length} tiles)</div>
        <div className="flex flex-wrap gap-1 max-h-[84px] overflow-y-auto">
          {rack.map((tile) => (
            <TileComponent key={tile.id} tile={tile} selected={false} onClick={() => {}} />
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="ai-debug-transcript"
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 max-h-[45vh]"
      >
        {items.length === 0 && (
          <p className="text-gray-500 italic text-sm">No transcript yet — waiting for {playerName}'s first turn.</p>
        )}
        {items.map((item, index) => (
          <AiDebugItemView key={`${item.ts}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

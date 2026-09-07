import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { socket } from "../socket";
import { useGame } from "./GameContext";
import type { AiDebugItem, AiDebugEventPayload, AiDebugHistoryPayload, Tile } from "@rummikub/shared";

export interface AiDebugStore {
  transcripts: Record<string, AiDebugItem[]>;
  racks: Record<string, Tile[]>;
  historyRequested: ReadonlySet<string>;
}

export function applyDebugEvent(
  store: AiDebugStore,
  payload: AiDebugEventPayload,
  currentRound: number | null
): AiDebugStore {
  if (currentRound !== null && payload.roundNumber !== currentRound) {
    return store;
  }
  return {
    ...store,
    transcripts: {
      ...store.transcripts,
      [payload.playerId]: [...(store.transcripts[payload.playerId] ?? []), payload.item],
    },
    racks: {
      ...store.racks,
      [payload.playerId]: payload.rack,
    },
  };
}

export function applyDebugHistory(
  store: AiDebugStore,
  payload: AiDebugHistoryPayload,
  currentRound: number | null
): AiDebugStore {
  if (currentRound !== null && payload.roundNumber !== currentRound) {
    return store;
  }
  return {
    ...store,
    transcripts: {
      ...store.transcripts,
      [payload.playerId]: payload.items,
    },
    racks: {
      ...store.racks,
      [payload.playerId]: payload.rack,
    },
    historyRequested: new Set([...store.historyRequested, payload.playerId]),
  };
}

export function makeEmptyStore(): AiDebugStore {
  return {
    transcripts: {},
    racks: {},
    historyRequested: new Set<string>(),
  };
}

export interface AiDebugScope {
  gameCode: string;
  roundNumber: number;
}

export function shouldClearDebugStore(previous: AiDebugScope | null, next: AiDebugScope): boolean {
  return (
    previous === null ||
    previous.gameCode !== next.gameCode ||
    previous.roundNumber !== next.roundNumber
  );
}

export function isNearBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - 8;
}

interface AiDebugContextValue extends AiDebugStore {
  openPlayerId: string | null;
  openConsole: (playerId: string) => void;
  closeConsole: () => void;
  requestHistory: (playerId: string) => void;
}

export const AiDebugContext = createContext<AiDebugContextValue>({
  ...makeEmptyStore(),
  openPlayerId: null,
  openConsole: () => {},
  closeConsole: () => {},
  requestHistory: () => {},
});

export function useAiDebug() {
  return useContext(AiDebugContext);
}

export function AiDebugProvider({ children }: { children: ReactNode }) {
  const { gameState, spectatorState } = useGame();
  const [store, setStore] = useState<AiDebugStore>(makeEmptyStore());
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const currentScopeRef = useRef<AiDebugScope | null>(null);

  const activeState = gameState ?? spectatorState;
  const gameCode = activeState?.id ?? null;
  const roundNumber = activeState?.roundNumber ?? null;

  useEffect(() => {
    if (gameCode === null || roundNumber === null) {
      return;
    }
    const next: AiDebugScope = { gameCode, roundNumber };
    if (shouldClearDebugStore(currentScopeRef.current, next)) {
      setStore(makeEmptyStore());
    }
    currentScopeRef.current = next;
  }, [gameCode, roundNumber]);

  useEffect(() => {
    function onDebugEvent(payload: AiDebugEventPayload) {
      setStore((store) => applyDebugEvent(store, payload, currentScopeRef.current?.roundNumber ?? null));
    }

    function onDebugHistory(payload: AiDebugHistoryPayload) {
      setStore((store) => applyDebugHistory(store, payload, currentScopeRef.current?.roundNumber ?? null));
    }

    socket.on("ai:debug", onDebugEvent);
    socket.on("ai:debugHistory", onDebugHistory);
    return () => {
      socket.off("ai:debug", onDebugEvent);
      socket.off("ai:debugHistory", onDebugHistory);
    };
  }, []);

  const openConsole = useCallback((playerId: string) => {
    setOpenPlayerId(playerId);
  }, []);

  const closeConsole = useCallback(() => {
    setOpenPlayerId(null);
  }, []);

  const requestHistory = useCallback((playerId: string) => {
    setStore((store) => {
      if (store.historyRequested.has(playerId)) {
        return store;
      }
      return {
        ...store,
        historyRequested: new Set([...store.historyRequested, playerId]),
      };
    });
    socket.emit("ai:debugHistory", { playerId });
  }, []);

  return (
    <AiDebugContext.Provider
      value={{ ...store, openPlayerId, openConsole, closeConsole, requestHistory }}
    >
      {children}
    </AiDebugContext.Provider>
  );
}

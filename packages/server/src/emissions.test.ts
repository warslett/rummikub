import { describe, it, expect, vi } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import { Game } from "./game.js";
import { emitStalemateEnded } from "./emissions.js";

function createStubIo() {
  const emitted: { room?: string; event: string; data: unknown }[] = [];
  return {
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, data: unknown) => {
        emitted.push({ room, event, data });
      }),
    })),
    emit: vi.fn(),
    sockets: {
      adapter: { rooms: new Map() },
      sockets: new Map(),
    },
    _emitted: emitted,
  } as unknown as SocketIOServer & { _emitted: { room?: string; event: string; data: unknown }[] };
}

describe("emissions", () => {
  describe("emitStalemateEnded", () => {
    it("should calculate stalemate scores and emit game:ended with isStalemate: true", () => {
      const io = createStubIo();
      const game = new Game("TEST01");
      game.addPlayer("p1", "Alice");
      game.addPlayer("p2", "Bob");
      game.start();

      game.seedGame({
        board: [],
        racks: {
          p1: [{ id: "red-1-a", color: "red", value: 1 }],
          p2: [{ id: "red-5-a", color: "red", value: 5 }],
        },
        pool: [],
        currentTurnPlayerId: "p1",
        hasInitialMeld: { p1: true, p2: true },
      });

      game.passTurn("p1");
      game.passTurn("p2");

      emitStalemateEnded(io, game, "TEST01");

      const event = io._emitted.find((e) => e.event === "game:ended");
      expect(event).toBeDefined();
      expect(event?.room).toBe("TEST01");
      expect(event?.data).toMatchObject({
        winnerId: "p1",
        winnerName: "Alice",
        isStalemate: true,
      });
      expect(game.getState().players.find((p) => p.id === "p1")?.gamesWon).toBe(1);
    });
  });
});

import { Server as SocketIOServer } from "socket.io";
import { GameManager } from "./gameManager.js";
import type { TileSet } from "@rummikub/shared";

const manager = new GameManager();

interface SocketData {
  playerId: string;
  gameCode: string;
}

export function registerHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    socket.on("game:create", ({ playerName }: { playerName: string }) => {
      const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { gameCode } = manager.createGame();
      const game = manager.getGame(gameCode)!;
      game.addPlayer(playerId, playerName);

      data.playerId = playerId;
      data.gameCode = gameCode;
      socket.join(gameCode);

      const gameUrl = `/game/${gameCode}`;
      socket.emit("game:created", { gameCode, gameUrl, playerId });
    });

    socket.on("game:join", ({ gameCode, playerName }: { gameCode: string; playerName: string }) => {
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      if (state.players.length >= 2) {
        socket.emit("game:error", { message: "Game is full" });
        return;
      }

      const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      game.addPlayer(playerId, playerName);

      data.playerId = playerId;
      data.gameCode = gameCode;
      socket.join(gameCode);

      const opponent = state.players[0];
      socket.emit("game:joined", { playerId, opponentName: opponent.name });
      socket.to(gameCode).emit("game:joined", { playerId: opponent.id, opponentName: playerName });
    });

    socket.on("game:start", ({ gameCode: gc }: { gameCode: string }) => {
      const game = manager.getGame(gc);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.start();
      } catch (err) {
        socket.emit("game:error", { message: (err as Error).message });
        return;
      }

      for (const player of game.getState().players) {
        const playerState = game.getPlayerState(player.id);
        for (const socketId of io.sockets.adapter.rooms.get(gc) ?? []) {
          const s = io.sockets.sockets.get(socketId);
          if (s && (s.data as SocketData).playerId === player.id) {
            s.emit("game:started", { gameState: playerState });
          }
        }
      }

      emitPlayerStates(io, game, gc);
    });

    socket.on("turn:draw", () => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.drawTile(data.playerId);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const endResult = game.checkGameEnd();
      if (endResult) {
        const scores = game.calculateScores();
        io.to(data.gameCode).emit("game:ended", {
          winnerId: endResult.winnerId,
          winnerName: endResult.winnerName,
          scores: game.getState().players.map((p) => ({
            playerId: p.id,
            name: p.name,
            score: p.id === endResult.winnerId ? scores!.winnerScore : scores!.loserPenalty,
            rackValue: p.id === endResult.winnerId ? 0 : scores!.loserPenalty * -1,
          })),
        });
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
    });

    socket.on("turn:play", ({ actions }: { actions: { sets: TileSet[] } }) => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.playSets(data.playerId, actions.sets);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      socket.emit("game:state", { gameState: game.getPlayerState(data.playerId) });
    });

    socket.on("turn:end", () => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.endTurn(data.playerId);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const endResult = game.checkGameEnd();
      if (endResult) {
        const scores = game.calculateScores();
        io.to(data.gameCode).emit("game:ended", {
          winnerId: endResult.winnerId,
          winnerName: endResult.winnerName,
          scores: game.getState().players.map((p) => ({
            playerId: p.id,
            name: p.name,
            score: p.id === endResult.winnerId ? scores!.winnerScore : scores!.loserPenalty,
            rackValue: p.id === endResult.winnerId ? 0 : scores!.loserPenalty * -1,
          })),
        });
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
    });

    socket.on("disconnect", () => {
      if (data.gameCode) {
        const game = manager.getGame(data.gameCode);
        if (game) {
          const player = game.getState().players.find((p) => p.id === data.playerId);
          if (player) {
            player.connected = false;
            socket.to(data.gameCode).emit("player:disconnected", {
              playerId: player.id,
              playerName: player.name,
            });
          }
        }
      }
    });
  });
}

function emitPlayerStates(io: SocketIOServer, game: ReturnType<GameManager["getGame"]>, gameCode: string): void {
  if (!game) return;
  for (const player of game.getState().players) {
    const sockets = io.sockets.adapter.rooms.get(gameCode);
    if (!sockets) continue;
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && (socket.data as SocketData).playerId === player.id) {
        socket.emit("game:state", { gameState: game.getPlayerState(player.id) });
      }
    }
  }
}

import { Server as SocketIOServer } from "socket.io";
import { GameManager } from "./gameManager.js";
import { MAX_PLAYERS } from "@rummikub/shared";
import type { TileSet } from "@rummikub/shared";
import type { SeedState } from "./game.js";
import type { SpectatorGameState } from "@rummikub/shared";

const manager = new GameManager();

interface SocketData {
  playerId: string;
  gameCode: string;
  isSpectator: boolean;
}

export function registerHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    data.playerId = "";
    data.gameCode = "";
    data.isSpectator = false;

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

      const players = game.getState().players.map((p) => ({ id: p.id, name: p.name }));
      io.to(gameCode).emit("game:lobbyState", { players });
    });

    socket.on("game:join", ({ gameCode, playerName }: { gameCode: string; playerName: string }) => {
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      if (state.players.length >= MAX_PLAYERS || state.phase !== "lobby") {
        socket.emit("game:full", { gameCode });
        return;
      }

      const playerId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      game.addPlayer(playerId, playerName);

      data.playerId = playerId;
      data.gameCode = gameCode;
      socket.join(gameCode);

      socket.emit("game:joined", { playerId });

      const players = game.getState().players.map((p) => ({ id: p.id, name: p.name }));
      io.to(gameCode).emit("game:lobbyState", { players });
    });

    socket.on("game:spectate", ({ gameCode }: { gameCode: string }) => {
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      if (state.players.length < MAX_PLAYERS && state.phase === "lobby") {
        socket.emit("game:error", { message: "Game is not full yet" });
        return;
      }

      data.gameCode = gameCode;
      data.playerId = "";
      data.isSpectator = true;
      socket.join(gameCode);

      socket.emit("spectator:joined", { gameState: game.getSpectatorState() });
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

      const sockets = io.sockets.adapter.rooms.get(gc);
      if (sockets) {
        for (const socketId of sockets) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
            const sd = s.data as SocketData;
            if (sd.isSpectator) {
              s.emit("game:started", { gameState: game.getSpectatorState() as SpectatorGameState });
            } else {
              s.emit("game:started", { gameState: game.getPlayerState(sd.playerId) });
            }
          }
        }
      }
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
        emitGameEnded(io, game, data.gameCode, endResult);
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

    socket.on("turn:manipulate", ({ newBoard }: { newBoard: TileSet[] }) => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.manipulateBoard(data.playerId, newBoard);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      socket.emit("game:state", { gameState: game.getPlayerState(data.playerId) });
    });

    socket.on("turn:undo", () => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.undoTurn(data.playerId);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      socket.emit("game:state", { gameState: game.getPlayerState(data.playerId) });
    });

    socket.on("turn:end", ({ newBoard }: { newBoard?: TileSet[] }) => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.endTurnWithBoard(data.playerId, newBoard);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const endResult = game.checkGameEnd();
      if (endResult) {
        emitGameEnded(io, game, data.gameCode, endResult);
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
    });

    socket.on("turn:pass", () => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.passTurn(data.playerId);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const state = game.getState();
      if (state.phase === "ended") {
        const scores = game.calculateStalemateScores();
        if (scores) {
          game.applyScores(scores);
          const players = state.players;
          const stalemateWinner = players.find((p) => p.id === scores.winnerId);
          if (stalemateWinner) stalemateWinner.gamesWon++;
          const loserMap = new Map(scores.losers.map((l) => [l.id, l]));
          io.to(data.gameCode).emit("game:ended", {
            winnerId: scores.winnerId,
            winnerName: scores.winnerName,
            scores: players.map((p) => ({
              playerId: p.id,
              name: p.name,
              score: p.id === scores.winnerId ? scores.winnerScore : (loserMap.get(p.id)?.penalty ?? 0),
              rackValue: p.id === scores.winnerId ? 0 : game.getRackValue(p.id),
            })),
            roundNumber: state.roundNumber,
            isStalemate: true,
            gamesWon: players.map((p) => ({ playerId: p.id, gamesWon: p.gamesWon })),
          });
        }
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
    });

    socket.on("game:playAgain", () => {
      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.startNewRound();
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
    });

    socket.on("game:reconnect", ({ gameCode, playerId }: { gameCode: string; playerId: string }) => {
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.reconnectPlayer(playerId);
      } catch (err) {
        socket.emit("game:error", { message: (err as Error).message });
        return;
      }

      data.playerId = playerId;
      data.gameCode = gameCode;
      socket.join(gameCode);

      socket.emit("game:state", { gameState: game.getPlayerState(playerId) });
      socket.to(gameCode).emit("player:reconnected", {
        playerId,
        playerName: game.getState().players.find((p) => p.id === playerId)!.name,
      });
      emitPlayerStates(io, game, gameCode);
    });

    if (process.env.NODE_ENV === "test") {
      socket.on("game:seed", ({ gameCode, state }: { gameCode: string; state: SeedState }) => {
        const game = manager.getGame(gameCode);
        if (!game) {
          socket.emit("game:error", { message: "Game not found" });
          return;
        }

        try {
          game.seedGame(state);
        } catch (err) {
          socket.emit("game:error", { message: (err as Error).message });
          return;
        }

        emitPlayerStates(io, game, gameCode);
      });
    }

    socket.on("disconnect", () => {
      if (data.gameCode && !data.isSpectator) {
        const game = manager.getGame(data.gameCode);
        if (game) {
          const player = game.getState().players.find((p) => p.id === data.playerId);
          if (player) {
            player.connected = false;
            socket.to(data.gameCode).emit("player:disconnected", {
              playerId: player.id,
              playerName: player.name,
            });
            if (game.getState().phase === "playing") {
              emitPlayerStates(io, game, data.gameCode);
            }
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
      const s = io.sockets.sockets.get(socketId);
      if (s && (s.data as SocketData).playerId === player.id) {
        s.emit("game:state", { gameState: game.getPlayerState(player.id) });
      }
    }
  }

  const roomSockets = io.sockets.adapter.rooms.get(gameCode);
  if (roomSockets) {
    const spectatorState = game.getSpectatorState();
    for (const socketId of roomSockets) {
      const s = io.sockets.sockets.get(socketId);
      if (s && (s.data as SocketData).isSpectator) {
        s.emit("game:state", { gameState: spectatorState });
      }
    }
  }
}

function emitGameEnded(io: SocketIOServer, game: ReturnType<GameManager["getGame"]>, gameCode: string, endResult: { winnerId: string; winnerName: string }): void {
  if (!game) return;
  const scores = game.calculateScores();
  const state = game.getState();
  if (scores) {
    game.applyScores(scores);
    const winner = state.players.find((p) => p.id === endResult.winnerId);
    if (winner) winner.gamesWon++;
    const loserMap = new Map(scores.losers.map((l) => [l.id, l]));
    io.to(gameCode).emit("game:ended", {
      winnerId: endResult.winnerId,
      winnerName: endResult.winnerName,
      scores: state.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        score: p.id === endResult.winnerId ? scores.winnerScore : (loserMap.get(p.id)?.penalty ?? 0),
        rackValue: p.id === endResult.winnerId ? 0 : game.getRackValue(p.id),
      })),
      roundNumber: state.roundNumber,
      isStalemate: false,
      gamesWon: state.players.map((p) => ({ playerId: p.id, gamesWon: p.gamesWon })),
    });
  }
}

export { manager };

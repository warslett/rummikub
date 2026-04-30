import { Server as SocketIOServer } from "socket.io";
import { GameManager } from "./gameManager.js";
import type { TileSet } from "@rummikub/shared";
import type { SeedState } from "./game.js";

const manager = new GameManager();

interface SocketData {
  playerId: string;
  gameCode: string;
  isSpectator: boolean;
}

export function registerHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    console.log(`[connection] new socket id=${socket.id}`);
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
      console.log(`[game:join] gameCode=${gameCode} playerName=${playerName}`);
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      console.debug(`[game:join] phase=${state.phase} players=${state.players.length} playerIds=[${state.players.map(p => p.id).join(",")}]`);
      if (state.players.length >= 2) {
        socket.emit("game:full", { gameCode });
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

    socket.on("game:spectate", ({ gameCode }: { gameCode: string }) => {
      console.log(`[game:spectate] gameCode=${gameCode}`);
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      console.debug(`[game:spectate] phase=${state.phase} players=${state.players.length} playerIds=[${state.players.map(p => p.id).join(",")}]`);

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
              s.emit("game:state", { gameState: game.getSpectatorState() });
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
        game.applyStalemateScores(scores);
        const players = state.players;
        const stalemateWinner = players.find((p) => p.id === scores.winnerId);
        if (stalemateWinner) stalemateWinner.gamesWon++;
        io.to(data.gameCode).emit("game:ended", {
            winnerId: scores.winnerId,
            winnerName: scores.winnerName,
            scores: players.map((p) => ({
              playerId: p.id,
              name: p.name,
              score: p.id === scores.winnerId ? scores.winnerScore : scores.loserPenalty,
              rackValue: game.getRackValue(p.id),
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
      console.log(`[game:reconnect] gameCode=${gameCode} playerId=${playerId}`);
      const game = manager.getGame(gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const state = game.getState();
      console.debug(`[game:reconnect] phase=${state.phase} players=${state.players.length} playerIds=[${state.players.map(p => p.id).join(",")}]`);

      try {
        game.reconnectPlayer(playerId);
      } catch (err) {
        console.log(`[game:reconnect] reconnectPlayer failed: ${(err as Error).message}`);
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
          }
        }
      }
    });
  });
}

function emitPlayerStates(io: SocketIOServer, game: ReturnType<GameManager["getGame"]>, gameCode: string): void {
  if (!game) return;
  console.debug(`[emitPlayerStates] gameCode=${gameCode} players=${game.getState().players.length}`);
  for (const player of game.getState().players) {
    const sockets = io.sockets.adapter.rooms.get(gameCode);
    if (!sockets) continue;
    for (const socketId of sockets) {
      const s = io.sockets.sockets.get(socketId);
      if (s && (s.data as SocketData).playerId === player.id) {
        console.debug(`[emitPlayerStates] emitting player state for playerId=${player.id} socketId=${socketId}`);
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
    io.to(gameCode).emit("game:ended", {
      winnerId: endResult.winnerId,
      winnerName: endResult.winnerName,
      scores: state.players.map((p) => ({
        playerId: p.id,
        name: p.name,
        score: p.id === endResult.winnerId ? scores.winnerScore : scores.loserPenalty,
        rackValue: p.id === endResult.winnerId ? 0 : game.getRackValue(p.id),
      })),
      roundNumber: state.roundNumber,
      isStalemate: false,
      gamesWon: state.players.map((p) => ({ playerId: p.id, gamesWon: p.gamesWon })),
    });
  }
}

export { manager };

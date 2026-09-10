import { Server as SocketIOServer } from "socket.io";
import { Game } from "./game.js";

interface SocketData {
  playerId: string;
  gameCode: string;
  isSpectator: boolean;
}

export function emitPlayerStates(io: SocketIOServer, game: Game | undefined, gameCode: string): void {
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

export function emitGameEnded(
  io: SocketIOServer,
  game: Game | undefined,
  gameCode: string,
  endResult: { winnerId: string; winnerName: string }
): void {
  if (!game) return;
  const scores = game.calculateScores();
  const state = game.getState();
  if (scores) {
    game.applyScores(scores);
    game.recordGameWon(endResult.winnerId);
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

export function emitStalemateEnded(
  io: SocketIOServer,
  game: Game | undefined,
  gameCode: string
): void {
  if (!game) return;
  const scores = game.calculateStalemateScores();
  if (scores) {
    game.applyScores(scores);
    game.recordGameWon(scores.winnerId);
    const state = game.getState();
    const players = state.players;
    const loserMap = new Map(scores.losers.map((l) => [l.id, l]));
    io.to(gameCode).emit("game:ended", {
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
}

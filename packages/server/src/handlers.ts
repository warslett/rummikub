import { Server as SocketIOServer } from "socket.io";
import { GameManager } from "./gameManager.js";
import { MAX_PLAYERS } from "@rummikub/shared";
import type { TileSet } from "@rummikub/shared";
import type { AiDebugHistoryRequestPayload } from "@rummikub/shared";
import type { SeedState } from "./game.js";
import type { SpectatorGameState } from "@rummikub/shared";
import { emitPlayerStates, emitGameEnded, emitStalemateEnded } from "./emissions.js";
import { maybeRunNextTurn, resetTurnContext, resetAiErrors } from "./ai/runner.js";
import { resetConversations } from "./ai/providers/llm.js";
import { getDebugTranscript, resetTranscripts } from "./ai/debug.js";
import { aiConfig } from "./ai/config.js";
import { getModels } from "./ai/models.js";

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

      const players = game.getState().players.map((p) => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI ?? false,
        model: p.model,
      }));
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

      const players = game.getState().players.map((p) => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI ?? false,
        model: p.model,
      }));
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

      maybeRunNextTurn(io, game, gc);
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
      maybeRunNextTurn(io, game, data.gameCode);
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
      maybeRunNextTurn(io, game, data.gameCode);
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
        emitStalemateEnded(io, game, data.gameCode);
        return;
      }

      emitPlayerStates(io, game, data.gameCode);
      maybeRunNextTurn(io, game, data.gameCode);
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

      resetConversations(data.gameCode, game.getState().roundNumber);
      resetTranscripts(data.gameCode, game.getState().roundNumber);
      resetTurnContext(data.gameCode);
      resetAiErrors(data.gameCode);

      emitPlayerStates(io, game, data.gameCode);
      maybeRunNextTurn(io, game, data.gameCode);
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
      if (game.getState().phase === "lobby") {
        const players = game.getState().players.map((p) => ({
          id: p.id,
          name: p.name,
          isAI: p.isAI ?? false,
          model: p.model,
        }));
        io.to(gameCode).emit("game:lobbyState", { players });
      }
      maybeRunNextTurn(io, game, gameCode);
    });

    socket.on("ai:add", (payload?: { model?: string; name?: string }) => {
      if (data.isSpectator) return;
      if (!payload || typeof payload.model !== "string" || !payload.model.trim()) {
        socket.emit("move:rejected", { reason: "Model is required" });
        return;
      }

      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      const name = typeof payload.name === "string" ? payload.name.trim() : "";

      try {
        game.addAiPlayer(payload.model.trim(), name);
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const players = game.getState().players.map((p) => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI ?? false,
        model: p.model,
      }));
      io.to(data.gameCode).emit("game:lobbyState", { players });
    });

    socket.on("ai:remove", (payload?: { playerId?: string }) => {
      if (data.isSpectator) return;
      if (!payload || typeof payload.playerId !== "string" || !payload.playerId.trim()) {
        socket.emit("move:rejected", { reason: "Player ID is required" });
        return;
      }

      const game = manager.getGame(data.gameCode);
      if (!game) {
        socket.emit("game:error", { message: "Game not found" });
        return;
      }

      try {
        game.removeAiPlayer(payload.playerId.trim());
      } catch (err) {
        socket.emit("move:rejected", { reason: (err as Error).message });
        return;
      }

      const players = game.getState().players.map((p) => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI ?? false,
        model: p.model,
      }));
      io.to(data.gameCode).emit("game:lobbyState", { players });
    });

    socket.on("ai:getModels", async () => {
      const models = await getModels();
      socket.emit("ai:models", models);
    });

    socket.on("ai:debugHistory", (payload?: Partial<AiDebugHistoryRequestPayload>) => {
      const game = manager.getGame(data.gameCode);
      const playerId = typeof payload?.playerId === "string" ? payload.playerId : "";
      if (!game) {
        socket.emit("ai:debugHistory", { playerId, roundNumber: 0, items: [], rack: [] });
        return;
      }

      const state = game.getState();
      const player = state.players.find((p) => p.id === playerId);
      if (!aiConfig.debug || !player?.isAI) {
        socket.emit("ai:debugHistory", {
          playerId,
          roundNumber: state.roundNumber,
          items: [],
          rack: [],
        });
        return;
      }

      socket.emit("ai:debugHistory", {
        playerId: player.id,
        roundNumber: state.roundNumber,
        items: getDebugTranscript(game, player.id),
        rack: [...player.rack],
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

        resetTurnContext(gameCode);
        emitPlayerStates(io, game, gameCode);
        maybeRunNextTurn(io, game, gameCode);
      });
    }

    socket.on("disconnect", () => {
      if (data.gameCode && !data.isSpectator) {
        const game = manager.getGame(data.gameCode);
        if (game) {
          const player = game.getState().players.find((p) => p.id === data.playerId);
          if (player) {
            game.setPlayerConnected(player.id, false);
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

export { manager };

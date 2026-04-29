import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerHandlers, manager } from "./handlers.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

if (process.env.NODE_ENV === "test") {
  app.post("/test/seed", (req, res) => {
    const { gameCode, state } = req.body;
    const game = manager.getGame(gameCode);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    try {
      game.seedGame(state);
      const sockets = io.sockets.adapter.rooms.get(gameCode);
      if (sockets) {
        for (const socketId of sockets) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
            const data = s.data as { playerId: string; gameCode: string };
            if (data.playerId) {
              s.emit("game:state", { gameState: game.getPlayerState(data.playerId) });
            }
          }
        }
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });
}

registerHandlers(io);
manager.startCleanup();

const PORT = parseInt(process.env.PORT ?? "3000", 10);
httpServer.listen(PORT, () => {
  console.log(`Rummikub server listening on port ${PORT}`);
});

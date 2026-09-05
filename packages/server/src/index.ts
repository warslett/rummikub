import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerHandlers, manager } from "./handlers.js";
import { emitPlayerStates } from "./emissions.js";
import { maybeRunNextTurn } from "./ai/runner.js";

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
  app.get("/test/game/:gameCode", (req, res) => {
    const game = manager.getGame(req.params.gameCode);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(game.getState());
  });

  app.post("/test/seed", (req, res) => {
    const { gameCode, state } = req.body;
    const game = manager.getGame(gameCode);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    try {
      game.seedGame(state);
      emitPlayerStates(io, game, gameCode);
      maybeRunNextTurn(io, game, gameCode);
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

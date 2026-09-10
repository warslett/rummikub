import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerHandlers, manager } from "./handlers.js";
import { emitPlayerStates } from "./emissions.js";
import { maybeRunNextTurn, resumePendingAiTurns } from "./ai/runner.js";
import { createGameStore } from "./storage/gameStore.js";
import { bootPersistence, reloadGames } from "./storage/bootstrap.js";
import { flushAiWrites } from "./storage/aiStore.js";
import { dbHealth } from "./storage/db.js";
import { storageConfig } from "./storage/config.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(express.json());

app.get("/health", async (_req, res) => {
  const db = storageConfig.enabled ? await dbHealth() : false;
  res.json({ status: "ok", db });
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

  app.post("/test/reload", async (_req, res) => {
    const restored = await reloadGames(manager);
    await resumePendingAiTurns(io, manager.getGames());
    res.json({ ok: true, restored });
  });
}

async function start(): Promise<void> {
  const store = createGameStore();
  const restored = await bootPersistence(manager, store);
  if (storageConfig.enabled) {
    console.log(`Restored ${restored} game(s) from database`);
    void resumePendingAiTurns(io, manager.getGames()).catch((err) =>
      console.error("Failed to resume AI turns:", err)
    );
  }

  registerHandlers(io);
  manager.startCleanup();

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`Received ${signal}, flushing pending game writes...`);
    manager.stopCleanup();
    try {
      await manager.flushStorage();
      await flushAiWrites();
      await store.close();
    } catch (err) {
      console.error("Error during shutdown:", err);
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  httpServer.listen(PORT, () => {
    console.log(`Rummikub server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

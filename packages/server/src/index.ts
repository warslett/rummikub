import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerHandlers } from "./handlers.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

registerHandlers(io);

const PORT = parseInt(process.env.PORT ?? "3000", 10);
httpServer.listen(PORT, () => {
  console.log(`Rummikub server listening on port ${PORT}`);
});

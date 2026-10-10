"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});
const rooms = new Map();

app.get("/", (_req, res) => res.send("Neon Orbit multiplayer server online."));
app.get("/health", (_req, res) => res.json({ online: true, rooms: rooms.size }));

io.on("connection", socket => {
  socket.on("create-room", callback => {
    if (typeof callback !== "function") return;
    let code;
    do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
    const room = { code, host: socket.id, players: [socket.id], started: false };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "host";
    callback({ success: true, code, role: "host" });
  });

  socket.on("join-room", (rawCode, callback) => {
    if (typeof callback !== "function") return;
    const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: "Sala não encontrada." });
    if (room.players.length >= 2) return callback({ success: false, error: "Essa sala já está cheia." });
    if (room.started) return callback({ success: false, error: "Essa partida já começou." });
    room.players.push(socket.id);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "guest";
    callback({ success: true, code, role: "guest" });
    io.to(code).emit("room-update", { code, players: room.players.length });
    socket.to(code).emit("player-joined");
  });

  socket.on("start-game", callback => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.host !== socket.id) {
      if (typeof callback === "function") callback({ success: false, error: "Somente o anfitrião pode iniciar." });
      return;
    }
    if (room.players.length !== 2) {
      if (typeof callback === "function") callback({ success: false, error: "Aguarde o segundo jogador entrar." });
      return;
    }
    room.started = true;
    if (typeof callback === "function") callback({ success: true });
    io.to(code).emit("game-start");
  });

  socket.on("game-state", state => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.host !== socket.id || !room.started) return;
    socket.to(room.code).emit("game-state", state);
  });

  socket.on("player-input", input => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || socket.data.role !== "guest" || !room.players.includes(socket.id) || !room.started) return;
    const x = Math.max(-1, Math.min(1, Number(input?.x) || 0));
    const y = Math.max(-1, Math.min(1, Number(input?.y) || 0));
    socket.to(room.code).emit("player-input", { playerId: socket.id, input: { x, y } });
  });

  socket.on("game-action", action => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || socket.data.role !== "guest" || !room.players.includes(socket.id) || !room.started) return;
    if (!action || !["ability", "upgrade-choice"].includes(action.type)) return;
    if (!Number.isInteger(action.index) || action.index < 0 || action.index > 8) return;
    socket.to(room.code).emit("game-action", { playerId: socket.id, action });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    if (room.host === socket.id) {
      io.to(code).emit("room-closed");
      rooms.delete(code);
      return;
    }
    room.players = room.players.filter(id => id !== socket.id);
    room.started = false;
    io.to(code).emit("room-update", { code, players: room.players.length });
    io.to(code).emit("player-left");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Servidor Neon Orbit iniciado na porta ${PORT}`));

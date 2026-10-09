
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

app.get("/health", (req, res) => {
  res.json({ online: true, rooms: rooms.size });
});

io.on("connection", (socket) => {
  socket.on("create-room", (callback) => {
    if (typeof callback !== "function") return;

    let code;

    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms.has(code));

    const room = {
      code,
      host: socket.id,
      players: [socket.id],
      state: null
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "host";

    callback({
      success: true,
      code,
      role: "host"
    });
  });

  socket.on("join-room", (rawCode, callback) => {
    if (typeof callback !== "function") return;

    const code = String(rawCode || "")
      .trim()
      .toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      callback({
        success: false,
        error: "Sala não encontrada."
      });
      return;
    }

    if (room.players.length >= 2) {
      callback({
        success: false,
        error: "Essa sala já está cheia."
      });
      return;
    }

    room.players.push(socket.id);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = "guest";

    callback({
      success: true,
      code,
      role: "guest"
    });

    io.to(code).emit("room-update", {
      code,
      players: room.players.length
    });

    socket.to(code).emit("player-joined");
  });

  socket.on("game-state", (state) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room || room.host !== socket.id) return;

    room.state = state;
    socket.to(code).emit("game-state", state);
  });

  socket.on("player-input", (input) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room || !room.players.includes(socket.id)) return;

    socket.to(code).emit("player-input", {
      playerId: socket.id,
      input
    });
  });

  socket.on("game-action", (action) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room || !room.players.includes(socket.id)) return;

    socket.to(code).emit("game-action", {
      playerId: socket.id,
      action
    });
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

    room.players = room.players.filter(
      (id) => id !== socket.id
    );

    io.to(code).emit("room-update", {
      code,
      players: room.players.length
    });

    io.to(code).emit("player-left");
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});

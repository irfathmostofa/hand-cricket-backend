const { Server } = require("socket.io");
const { rooms } = require("./rooms");
const { handleCreateRoom, handleJoinRoom } = require("./game/createRoom");
const { doToss } = require("./game/toss");
const { startBall, submitChoice } = require("./game/ball");

function setupSocket(server) {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Room events
    socket.on("create-room", () => handleCreateRoom(socket));
    socket.on("join-room", (roomId) => handleJoinRoom(socket, roomId));

    // Toss
    socket.on("start-toss", (roomId) => {
      const room = rooms.get(roomId);
      if (!room) return;

      if (!room.players.p1 || !room.players.p2) {
        socket.emit("error", "Cannot start toss: waiting for second player!");
        return;
      }

      doToss(room, io);
    });

    // Ball choice
    socket.on("choose-number", ({ roomId, number }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      submitChoice(room, socket.id, number, io);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      // Find room
      const room = [...rooms.values()].find((r) =>
        Object.values(r.players).includes(socket.id),
      );
      if (!room) return;

      io.to(room.roomId).emit("player-left", {
        message: "⚠️ Opponent left the game. Match ended.",
      });

      // Remove room completely (for free-tier simplicity)
      rooms.delete(room.roomId);
    });
  });
}

module.exports = { setupSocket };

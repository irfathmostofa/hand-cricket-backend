const { rooms, createRoom, joinRoom } = require("../rooms");

function handleCreateRoom(socket) {
  const roomId = createRoom(socket.id);
  socket.join(roomId);
  socket.emit("room-created", roomId);
  console.log(`Room created: ${roomId} by ${socket.id}`);
}

function handleJoinRoom(socket, roomId) {
  const room = joinRoom(roomId, socket.id);
  if (!room) {
    socket.emit("error", "Room not found");
    return;
  }
  if (room === "FULL") {
    socket.emit("error", "Room is full");
    return;
  }

  socket.join(roomId);
  console.log(`${socket.id} joined room ${roomId}`);

  // Notify both players
  const players = Object.values(room.players);
  socket.to(roomId).emit("room-joined", players);
  socket.emit("room-joined", players);
}

module.exports = { handleCreateRoom, handleJoinRoom };

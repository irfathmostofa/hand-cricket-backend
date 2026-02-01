// src/rooms.js
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(playerId) {
  const roomId = generateRoomId();

  const room = {
    roomId,
    players: {
      p1: playerId,
      p2: null,
    },
    status: "WAITING", // WAITING, TOSS, INNINGS_1, INNINGS_2, FINISHED
    toss: {
      winner: null,
      battingFirst: null,
    },
    config: {
      overs: 2,
      ballsPerOver: 6,
      maxWickets: 5,
    },
    innings: {
      current: 1,
      first: {
        batting: null,
        bowling: null,
        score: 0,
        wicketsLeft: 5,
        balls: 0,
      },
      second: {
        batting: null,
        bowling: null,
        score: 0,
        wicketsLeft: 5,
        balls: 0,
        target: 0,
      },
    },
    currentBall: {
      choices: {},
      timer: null,
    },
  };

  rooms.set(roomId, room);
  return roomId;
}

function joinRoom(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.players.p2) return "FULL";

  room.players.p2 = playerId;
  room.status = "TOSS";
  return room;
}

module.exports = { rooms, createRoom, joinRoom };

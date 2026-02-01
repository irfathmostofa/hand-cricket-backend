const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Health check
app.get("/", (req, res) => {
  res.send("Hand Cricket Backend Running 🏏");
});

// Initialize rooms map
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

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Helper functions
function startBall(room) {
  room.currentBall.choices = {};

  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;

  io.to(room.roomId).emit("ball-start", {
    inningsNumber: room.innings.current,
    gameState: getGameState(room),
  });

  room.currentBall.timer = setTimeout(() => {
    resolveBall(room);
  }, 5000);
}

function resolveBall(room) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;
  const battingId = innings.batting;
  const bowlingId = innings.bowling;

  const bat =
    room.currentBall.choices[battingId] || Math.floor(Math.random() * 6) + 1;
  const bowl =
    room.currentBall.choices[bowlingId] || Math.floor(Math.random() * 6) + 1;

  innings.balls++;

  let result = {
    bat,
    bowl,
    battingId,
    bowlingId,
    isOut: false,
    runs: 0,
  };

  if (bat === bowl) {
    innings.wicketsLeft--;
    result.isOut = true;
    result.message = "💥 OUT!";
  } else {
    innings.score += bat;
    result.runs = bat;
    result.message = `+${bat} runs!`;
  }

  io.to(room.roomId).emit("ball-result", {
    ...result,
    gameState: getGameState(room),
  });

  setTimeout(() => {
    checkInningsEnd(room);
  }, 2000);
}

function checkInningsEnd(room) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;
  const totalBalls = room.config.overs * room.config.ballsPerOver;

  if (innings.wicketsLeft <= 0 || innings.balls >= totalBalls) {
    if (room.innings.current === 1) {
      switchInnings(room);
      io.to(room.roomId).emit("innings-end", {
        target: room.innings.second.target,
        firstInningsScore: room.innings.first.score,
        gameState: getGameState(room),
      });

      setTimeout(() => {
        startBall(room);
      }, 3000);
    } else {
      endMatch(room);
    }
  } else {
    if (room.innings.current === 2 && innings.score >= innings.target) {
      endMatch(room);
    } else {
      setTimeout(() => {
        startBall(room);
      }, 3000);
    }
  }
}

function switchInnings(room) {
  room.innings.current = 2;
  room.status = "INNINGS_2";
  room.innings.second.target = room.innings.first.score + 1;
}

function endMatch(room) {
  const innings1 = room.innings.first;
  const innings2 = room.innings.second;

  let winner;
  let margin;

  if (innings2.score >= innings2.target) {
    winner = innings2.batting;
    margin = `by ${innings2.wicketsLeft} wickets`;
  } else {
    winner = innings1.batting;
    margin = `by ${innings2.target - innings2.score - 1} runs`;
  }

  const playerNum = winner === room.players.p1 ? "1" : "2";

  io.to(room.roomId).emit("match-end", {
    winner,
    margin,
    message: `🏆 Player ${playerNum} won ${margin}!`,
    gameState: getGameState(room),
  });

  room.status = "FINISHED";
}

function getGameState(room) {
  const currentInnings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;

  return {
    inningsNumber: room.innings.current,
    score: currentInnings.score,
    wickets: room.config.maxWickets - currentInnings.wicketsLeft,
    wicketsLeft: currentInnings.wicketsLeft,
    balls: currentInnings.balls,
    overs: Math.floor(currentInnings.balls / room.config.ballsPerOver),
    ballsInOver: currentInnings.balls % room.config.ballsPerOver,
    target: room.innings.current === 2 ? room.innings.second.target : null,
    battingPlayer: currentInnings.batting,
    bowlingPlayer: currentInnings.bowling,
    totalOvers: room.config.overs,
  };
}

function doToss(room) {
  const players = [room.players.p1, room.players.p2];
  const winner = players[Math.floor(Math.random() * 2)];

  room.toss.winner = winner;
  room.toss.battingFirst = winner;

  room.innings.first.batting = winner;
  room.innings.first.bowling = players.find((p) => p !== winner);

  room.innings.second.batting = room.innings.first.bowling;
  room.innings.second.bowling = winner;

  room.status = "INNINGS_1";

  const playerNum = winner === room.players.p1 ? "1" : "2";

  io.to(room.roomId).emit("toss-result", {
    winner,
    battingFirst: winner,
    message: `🎉 Player ${playerNum} won the toss and will bat first!`,
  });

  setTimeout(() => {
    startBall(room);
  }, 3000);
}

// Socket event handlers
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", () => {
    const roomId = createRoom(socket.id);
    socket.join(roomId);
    socket.emit("room-created", roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on("join-room", (roomId) => {
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

    const players = Object.values(room.players);
    socket.to(roomId).emit("room-joined", players);
    socket.emit("room-joined", players);
  });

  socket.on("start-toss", (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (!room.players.p1 || !room.players.p2) {
      socket.emit("error", "Cannot start toss: waiting for second player!");
      return;
    }

    doToss(room);
  });

  socket.on("choose-number", ({ roomId, number }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.currentBall.choices[socket.id] = number;

    io.to(room.roomId).emit("choice-submitted", {
      playerId: socket.id,
      choiceCount: Object.keys(room.currentBall.choices).length,
    });

    if (Object.keys(room.currentBall.choices).length === 2) {
      if (room.currentBall.timer) {
        clearTimeout(room.currentBall.timer);
      }
      resolveBall(room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const [roomId, room] of rooms.entries()) {
      if (Object.values(room.players).includes(socket.id)) {
        io.to(roomId).emit("player-left", {
          message: "⚠️ Opponent left the game. Match ended.",
        });
        rooms.delete(roomId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

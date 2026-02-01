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
    status: "WAITING",
    toss: {
      winner: null,
      battingFirst: null,
    },
    config: {
      overs: 1, // Only 1 over
      ballsPerOver: 6,
      maxWickets: 2, // Only 2 wickets
    },
    innings: {
      current: 1,
      first: {
        batting: null,
        bowling: null,
        score: 0,
        wicketsLeft: 2,
        balls: 0,
      },
      second: {
        batting: null,
        bowling: null,
        score: 0,
        wicketsLeft: 2,
        balls: 0,
        target: 0,
      },
    },
    currentBall: {
      choices: {}, // Will store both players' choices
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

  // Start first ball after delay
  setTimeout(() => {
    startBall(room);
  }, 3000);
}

function startBall(room) {
  // Reset choices for new ball
  room.currentBall.choices = {};

  // Clear any existing timer
  if (room.currentBall.timer) {
    clearTimeout(room.currentBall.timer);
  }

  // Start 10-second timer for auto-choice
  room.currentBall.timer = setTimeout(() => {
    // Auto-select for players who haven't chosen
    const innings =
      room.innings.current === 1 ? room.innings.first : room.innings.second;
    const battingId = innings.batting;
    const bowlingId = innings.bowling;

    if (!room.currentBall.choices[battingId]) {
      room.currentBall.choices[battingId] = Math.floor(Math.random() * 6) + 1;
    }
    if (!room.currentBall.choices[bowlingId]) {
      room.currentBall.choices[bowlingId] = Math.floor(Math.random() * 6) + 1;
    }

    resolveBall(room);
  }, 10000); // 10 seconds

  io.to(room.roomId).emit("ball-start", {
    inningsNumber: room.innings.current,
    gameState: getGameState(room),
  });
}

function resolveBall(room) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;
  const battingId = innings.batting;
  const bowlingId = innings.bowling;

  // Get choices (with fallback to random)
  const batChoice =
    room.currentBall.choices[battingId] || Math.floor(Math.random() * 6) + 1;
  const bowlChoice =
    room.currentBall.choices[bowlingId] || Math.floor(Math.random() * 6) + 1;

  // Increment ball count
  innings.balls++;

  let result = {
    bat: batChoice,
    bowl: bowlChoice,
    battingId,
    bowlingId,
    isOut: false,
    runs: 0,
  };

  // HAND CRICKET RULES: If numbers match = OUT, else batsman scores
  if (batChoice === bowlChoice) {
    innings.wicketsLeft--;
    result.isOut = true;
    result.message = "💥 OUT! Numbers matched!";
  } else {
    innings.score += batChoice;
    result.runs = batChoice;
    result.message = `+${batChoice} runs scored!`;
  }

  // Send result to both players
  io.to(room.roomId).emit("ball-result", {
    ...result,
    gameState: getGameState(room),
  });

  // Check if innings/match ended
  setTimeout(() => {
    checkInningsEnd(room);
  }, 2000);
}

function checkInningsEnd(room) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;
  const totalBalls = room.config.overs * room.config.ballsPerOver;

  // End conditions: all wickets gone OR all balls bowled
  if (innings.wicketsLeft <= 0 || innings.balls >= totalBalls) {
    if (room.innings.current === 1) {
      // Switch to second innings
      room.innings.current = 2;
      room.status = "INNINGS_2";
      room.innings.second.target = innings.score + 1; // Target is 1 more than first innings score

      io.to(room.roomId).emit("innings-end", {
        target: room.innings.second.target,
        firstInningsScore: innings.score,
        gameState: getGameState(room),
      });

      // Start second innings after delay
      setTimeout(() => {
        startBall(room);
      }, 3000);
    } else {
      // End game - second innings completed
      endMatch(room);
    }
  } else {
    // In second innings, check if target already achieved
    if (room.innings.current === 2 && innings.score >= innings.target) {
      endMatch(room);
    } else {
      // Continue with next ball
      setTimeout(() => {
        startBall(room);
      }, 3000);
    }
  }
}

function endMatch(room) {
  const innings1 = room.innings.first;
  const innings2 = room.innings.second;

  let winner;
  let margin;

  if (innings2.score >= innings2.target) {
    winner = innings2.batting; // Chasing team won
    const wicketsLeft = innings2.wicketsLeft;
    margin = `by ${wicketsLeft} wicket${wicketsLeft !== 1 ? "s" : ""}`;
  } else {
    winner = innings1.batting; // Defending team won
    const runsDifference = innings2.target - innings2.score - 1;
    margin = `by ${runsDifference} run${runsDifference !== 1 ? "s" : ""}`;
  }

  const playerNum = winner === room.players.p1 ? "1" : "2";

  io.to(room.roomId).emit("match-end", {
    winner,
    margin,
    message: `🏆 Player ${playerNum} won ${margin}!`,
    firstInningsScore: innings1.score,
    secondInningsScore: innings2.score,
    target: innings2.target,
    gameState: getGameState(room),
  });

  room.status = "FINISHED";
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

    console.log(`Player ${socket.id} chose number: ${number}`);

    // Store player's choice
    room.currentBall.choices[socket.id] = number;

    // Notify room that a choice was made
    io.to(room.roomId).emit("choice-submitted", {
      playerId: socket.id,
      choice: number,
      choiceCount: Object.keys(room.currentBall.choices).length,
    });

    // Check if both players have chosen
    const players = [room.players.p1, room.players.p2];
    const hasBothChoices = players.every(
      (playerId) => room.currentBall.choices[playerId],
    );

    if (hasBothChoices) {
      console.log("Both players have chosen, resolving ball...");
      // Clear the timeout since both chose
      if (room.currentBall.timer) {
        clearTimeout(room.currentBall.timer);
      }
      resolveBall(room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Find and clean up room
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

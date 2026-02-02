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

function createRoom(playerId, playerName) {
  const roomId = generateRoomId();

  const room = {
    roomId,
    players: {
      p1: { id: playerId, name: playerName },
      p2: null,
    },
    playerNames: {
      [playerId]: playerName,
    },
    status: "WAITING",
    toss: {
      winner: null,
      battingFirst: null,
    },
    config: {
      overs: 1,
      ballsPerOver: 6,
      maxWickets: 2,
    },
    innings: {
      current: 1,
      first: {
        batting: null,
        battingName: null,
        bowling: null,
        bowlingName: null,
        score: 0,
        wicketsLeft: 2,
        balls: 0,
        ballHistory: [], // Store ball history per innings
      },
      second: {
        batting: null,
        battingName: null,
        bowling: null,
        bowlingName: null,
        score: 0,
        wicketsLeft: 2,
        balls: 0,
        target: 0,
        ballHistory: [], // Store ball history per innings
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

function joinRoom(roomId, playerId, playerName) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.players.p2) return "FULL";

  room.players.p2 = { id: playerId, name: playerName };
  room.playerNames[playerId] = playerName;
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
    battingPlayerName: currentInnings.battingName,
    bowlingPlayer: currentInnings.bowling,
    bowlingPlayerName: currentInnings.bowlingName,
    totalOvers: room.config.overs,
  };
}

function getPlayerName(room, playerId) {
  return (
    room.playerNames[playerId] ||
    `Player ${playerId === room.players.p1?.id ? "1" : "2"}`
  );
}

function doToss(room) {
  const players = [room.players.p1, room.players.p2];
  const winner = Math.random() < 0.5 ? room.players.p1 : room.players.p2;

  room.toss.winner = winner.id;
  room.toss.battingFirst = winner.id;

  room.innings.first.batting = winner.id;
  room.innings.first.battingName = winner.name;
  room.innings.first.bowling = players.find((p) => p.id !== winner.id).id;
  room.innings.first.bowlingName = players.find((p) => p.id !== winner.id).name;

  room.innings.second.batting = room.innings.first.bowling;
  room.innings.second.battingName = room.innings.first.bowlingName;
  room.innings.second.bowling = winner.id;
  room.innings.second.bowlingName = winner.name;

  room.status = "INNINGS_1";

  io.to(room.roomId).emit("toss-result", {
    winner: winner.id,
    winnerName: winner.name,
    battingFirst: winner.id,
    battingFirstName: winner.name,
    message: `🎉 ${winner.name} won the toss and chose to bat first!`,
  });

  // Start first ball after delay
  setTimeout(() => {
    startBall(room);
  }, 4000);
}

function startBall(room) {
  room.currentBall.choices = {};

  if (room.currentBall.timer) {
    clearTimeout(room.currentBall.timer);
  }

  room.currentBall.timer = setTimeout(() => {
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
  }, 10000);

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

  const batChoice =
    room.currentBall.choices[battingId] || Math.floor(Math.random() * 6) + 1;
  const bowlChoice =
    room.currentBall.choices[bowlingId] || Math.floor(Math.random() * 6) + 1;

  innings.balls++;

  let result = {
    bat: batChoice,
    bowl: bowlChoice,
    battingId,
    battingName: innings.battingName,
    bowlingId,
    bowlingName: innings.bowlingName,
    isOut: false,
    runs: 0,
    innings: room.innings.current,
  };

  // Add to ball history for this innings
  const ballRecord = {
    bat: batChoice,
    bowl: bowlChoice,
    isOut: false,
    runs: 0,
    innings: room.innings.current,
  };

  if (batChoice === bowlChoice) {
    innings.wicketsLeft--;
    result.isOut = true;
    result.message = "OUT! Numbers matched!";
    ballRecord.isOut = true;
  } else {
    innings.score += batChoice;
    result.runs = batChoice;
    result.message = `${batChoice} runs scored!`;
    ballRecord.runs = batChoice;
  }

  // Add to innings ball history
  innings.ballHistory.push(ballRecord);

  io.to(room.roomId).emit("ball-result", {
    ...result,
    gameState: getGameState(room),
    ballHistory: innings.ballHistory.slice(-4), // Send last 4 balls
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
      room.innings.current = 2;
      room.status = "INNINGS_2";
      room.innings.second.target = innings.score + 1;

      io.to(room.roomId).emit("innings-end", {
        target: room.innings.second.target,
        firstInningsScore: innings.score,
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

function endMatch(room) {
  const innings1 = room.innings.first;
  const innings2 = room.innings.second;

  let winner, winnerName, margin;

  if (innings2.score >= innings2.target) {
    winner = innings2.batting;
    winnerName = innings2.battingName;
    const wicketsLeft = innings2.wicketsLeft;
    margin = `by ${wicketsLeft} wicket${wicketsLeft !== 1 ? "s" : ""}`;
  } else {
    winner = innings1.batting;
    winnerName = innings1.battingName;
    const runsDifference = innings2.target - innings2.score - 1;
    margin = `by ${runsDifference} run${runsDifference !== 1 ? "s" : ""}`;
  }

  const isPlayer1 = winner === room.players.p1.id;
  const player1Name = room.players.p1.name;
  const player2Name = room.players.p2.name;

  io.to(room.roomId).emit("match-end", {
    winner,
    winnerName,
    margin,
    message: `${winnerName} won ${margin}!`,
    firstInningsScore: innings1.score,
    secondInningsScore: innings2.score,
    target: innings2.target,
    player1Name,
    player2Name,
    gameState: getGameState(room),
  });

  room.status = "FINISHED";
}

// Socket event handlers
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", (playerName) => {
    const name = playerName?.trim() || `Player_${socket.id.slice(0, 4)}`;
    const roomId = createRoom(socket.id, name);
    socket.join(roomId);
    socket.emit("room-created", roomId);
    console.log(`Room created: ${roomId} by ${name} (${socket.id})`);
  });

  socket.on("join-room", ({ roomId, playerName }) => {
    const name = playerName?.trim() || `Player_${socket.id.slice(0, 4)}`;
    const room = joinRoom(roomId, socket.id, name);

    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }
    if (room === "FULL") {
      socket.emit("error", "Room is full");
      return;
    }

    socket.join(roomId);
    console.log(`${name} (${socket.id}) joined room ${roomId}`);

    const playerInfo = {
      player1: room.players.p1,
      player2: room.players.p2,
      playerNames: room.playerNames,
    };

    socket.to(roomId).emit("room-joined", playerInfo);
    socket.emit("room-joined", playerInfo);
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
      playerName: room.playerNames[socket.id],
      choice: number,
      choiceCount: Object.keys(room.currentBall.choices).length,
    });

    const players = [room.players.p1.id, room.players.p2.id];
    const hasBothChoices = players.every(
      (playerId) => room.currentBall.choices[playerId],
    );

    if (hasBothChoices) {
      if (room.currentBall.timer) {
        clearTimeout(room.currentBall.timer);
      }
      resolveBall(room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (const [roomId, room] of rooms.entries()) {
      if (
        room.players.p1?.id === socket.id ||
        room.players.p2?.id === socket.id
      ) {
        const playerName = room.playerNames[socket.id];
        io.to(roomId).emit("player-left", {
          message: `⚠️ ${playerName} left the game. Match ended.`,
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

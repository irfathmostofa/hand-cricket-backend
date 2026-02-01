// src/game/ball.js - UPDATED VERSION
const { switchInnings } = require("./innings");

function startBall(room, io) {
  room.currentBall.choices = {};

  // Emit ball-start event to both players
  io.to(room.roomId).emit("ball-start", {
    inningsNumber: room.innings.current,
    gameState: getGameState(room),
  });

  room.currentBall.timer = setTimeout(() => {
    resolveBall(room, io);
  }, 5000); // 5 second timer
}

function submitChoice(room, socketId, number, io) {
  room.currentBall.choices[socketId] = number;

  // Notify room that a choice was made
  io.to(room.roomId).emit("choice-submitted", {
    playerId: socketId,
    choiceCount: Object.keys(room.currentBall.choices).length,
  });

  if (Object.keys(room.currentBall.choices).length === 2) {
    clearTimeout(room.currentBall.timer);
    resolveBall(room, io);
  }
}

function resolveBall(room, io) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;

  const battingId = innings.batting;
  const bowlingId = innings.bowling;

  const bat = room.currentBall.choices[battingId] || 0;
  const bowl = room.currentBall.choices[bowlingId] || 0;

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
    io.to(room.roomId).emit("ball-result", {
      ...result,
      message: "💥 OUT!",
      gameState: getGameState(room),
    });
  } else {
    innings.score += bat;
    result.runs = bat;
    io.to(room.roomId).emit("ball-result", {
      ...result,
      message: `+${bat} runs!`,
      gameState: getGameState(room),
    });
  }

  // Check if innings/match ended
  setTimeout(() => {
    checkInningsEnd(room, io);
  }, 2000); // 2 second delay to show result
}

function checkInningsEnd(room, io) {
  const innings =
    room.innings.current === 1 ? room.innings.first : room.innings.second;

  const totalBalls = room.config.overs * room.config.ballsPerOver;

  // End conditions
  if (innings.wicketsLeft <= 0 || innings.balls >= totalBalls) {
    if (room.innings.current === 1) {
      switchInnings(room);
      io.to(room.roomId).emit("innings-end", {
        target: room.innings.second.target,
        firstInningsScore: room.innings.first.score,
        gameState: getGameState(room),
      });

      // Start second innings after delay
      setTimeout(() => {
        startBall(room, io);
      }, 3000);
    } else {
      // End game
      const winner =
        room.innings.second.score >= room.innings.second.target
          ? room.innings.second.batting
          : room.innings.first.batting;

      const margin =
        room.innings.second.score >= room.innings.second.target
          ? `by ${room.innings.second.wicketsLeft} wickets`
          : `by ${room.innings.second.target - room.innings.second.score - 1} runs`;

      io.to(room.roomId).emit("match-end", {
        winner,
        margin,
        message: `🏆 Player ${winner === room.players.p1 ? "1" : "2"} won ${margin}!`,
        gameState: getGameState(room),
      });

      room.status = "FINISHED";
    }
  } else {
    // Continue - check if in second innings and target achieved
    if (
      room.innings.current === 2 &&
      room.innings.second.score >= room.innings.second.target
    ) {
      const winner = room.innings.second.batting;
      const margin = `by ${room.innings.second.wicketsLeft} wickets`;

      io.to(room.roomId).emit("match-end", {
        winner,
        margin,
        message: `🏆 Player ${winner === room.players.p1 ? "1" : "2"} won ${margin}!`,
        gameState: getGameState(room),
      });

      room.status = "FINISHED";
    } else {
      // Start next ball
      setTimeout(() => {
        startBall(room, io);
      }, 3000);
    }
  }
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

module.exports = { startBall, submitChoice };

// src/game/toss.js - UPDATED VERSION
const { startBall } = require("./ball");

function doToss(room, io) {
  const players = Object.values(room.players);
  const winner = players[Math.floor(Math.random() * 2)];

  room.toss.winner = winner;
  room.toss.battingFirst = winner;

  room.innings.first.batting = winner;
  room.innings.first.bowling = players.find((p) => p !== winner);

  room.innings.second.batting = room.innings.first.bowling;
  room.innings.second.bowling = winner;

  room.status = "INNINGS_1";

  io.to(room.roomId).emit("toss-result", {
    winner,
    battingFirst: winner,
    message: `🎉 Player ${winner === room.players.p1 ? "1" : "2"} won the toss and will bat first!`,
  });

  // Start first ball after toss animation delay
  setTimeout(() => {
    startBall(room, io);
  }, 3000);
}

module.exports = { doToss };

// Optional helper to calculate final results (we mostly use in ball.js)
function getMatchWinner(room) {
  if (room.innings.second.score >= room.innings.second.target) {
    return room.innings.second.batting;
  } else {
    return room.innings.first.batting;
  }
}

module.exports = { getMatchWinner };

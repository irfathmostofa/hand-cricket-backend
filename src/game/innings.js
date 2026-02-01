function switchInnings(room) {
  room.innings.current = 2;
  room.status = "INNINGS_2";

  room.innings.second.target = room.innings.first.score + 1;

  console.log(
    `First innings ended. Target for second innings: ${room.innings.second.target}`,
  );
}

module.exports = { switchInnings };

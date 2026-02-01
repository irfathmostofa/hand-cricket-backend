// src/server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { setupSocket } = require("./socket");

const app = express();
app.use(cors());

const server = http.createServer(app);

// health check (important for Render)
app.get("/", (req, res) => {
  res.send("Hand Cricket Backend Running 🏏");
});

setupSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

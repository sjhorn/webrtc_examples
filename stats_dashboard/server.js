const express = require("express");
const { Server } = require("ws");

const app = express();
app.use(express.static("public"));
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

const clients = [];

wss.on("connection", (socket) => {
  clients.push(socket);
  const clientId = clients.length;
  console.log(`Client ${clientId} connected (total: ${clients.length})`);

  socket.on("message", (data) => {
    const msg = JSON.parse(data);
    // Broadcast to other clients
    clients.forEach((client) => {
      if (client !== socket && client.readyState === 1) {
        client.send(JSON.stringify(msg));
      }
    });
  });

  socket.on("close", () => {
    const idx = clients.indexOf(socket);
    if (idx > -1) clients.splice(idx, 1);
    console.log(`Client disconnected (total: ${clients.length})`);
  });
});

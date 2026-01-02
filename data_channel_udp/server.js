const express = require("express");
const { Server } = require("ws");

const app = express();
app.use(express.static("public"));
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

const peers = new Map();
let peerCount = 0;

wss.on("connection", (socket) => {
  const peerId = ++peerCount;
  peers.set(peerId, socket);
  console.log(`Peer ${peerId} connected (total: ${peers.size})`);

  socket.send(JSON.stringify({ type: "id", peerId }));

  socket.on("message", (data) => {
    const msg = JSON.parse(data);
    console.log(`Peer ${peerId} sent:`, msg.type);

    for (const [id, peer] of peers) {
      if (id !== peerId && peer.readyState === 1) {
        peer.send(JSON.stringify({ ...msg, from: peerId }));
      }
    }
  });

  socket.on("close", () => {
    peers.delete(peerId);
    console.log(`Peer ${peerId} disconnected (total: ${peers.size})`);
  });
});

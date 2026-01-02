const express = require("express");
const { Server } = require("ws");

const app = express();
app.use(express.static("public"));
// Serve .wav files from root directory
app.get("/peer:num.wav", (req, res) => {
  res.sendFile(`peer${req.params.num}.wav`, { root: __dirname });
});
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

let receiver = null; // The browser client
const peers = new Map(); // peerId -> socket
let peerCount = 0;

wss.on("connection", (socket) => {
  let clientId = null;
  let isReceiver = false;

  socket.on("message", (data) => {
    const msg = JSON.parse(data);

    // Registration
    if (msg.type === "register") {
      if (msg.role === "receiver") {
        receiver = socket;
        isReceiver = true;
        console.log("Browser receiver connected");
        return;
      } else if (msg.role === "peer") {
        clientId = ++peerCount;
        peers.set(clientId, socket);
        console.log(`Peer ${clientId} connected (audio: ${msg.audioFile})`);

        // Send ID back to peer
        socket.send(JSON.stringify({ type: "id", peerId: clientId }));

        // Notify receiver about new peer
        if (receiver && receiver.readyState === 1) {
          receiver.send(JSON.stringify({ type: "peer-joined", peerId: clientId }));
        }
        return;
      }
    }

    // Route signaling messages
    if (msg.target === "receiver" && receiver && receiver.readyState === 1) {
      // Peer -> Receiver
      receiver.send(JSON.stringify({ ...msg, from: clientId }));
    } else if (msg.target && typeof msg.target === "number") {
      // Receiver -> Peer
      const targetPeer = peers.get(msg.target);
      if (targetPeer && targetPeer.readyState === 1) {
        targetPeer.send(JSON.stringify({ ...msg, from: "receiver" }));
      }
    }
  });

  socket.on("close", () => {
    if (isReceiver) {
      receiver = null;
      console.log("Browser receiver disconnected");
    } else if (clientId) {
      peers.delete(clientId);
      console.log(`Peer ${clientId} disconnected`);

      // Notify receiver
      if (receiver && receiver.readyState === 1) {
        receiver.send(JSON.stringify({ type: "peer-left", peerId: clientId }));
      }
    }
  });
});

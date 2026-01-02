const fs = require("fs");
const { Server } = require("ws");
const express = require("express");
const { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RtpPacket, RtpHeader } = require("werift");

const app = express();
app.use(express.static("public"));
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

// Load pre-encoded μ-law file (ffmpeg -i audio.wav -f mulaw -ar 8000 -ac 1 audio.ulaw)
const ulaw = fs.readFileSync("audio.ulaw");
const packets = [];
for (let i = 0; i < ulaw.length; i += 160) packets.push(ulaw.slice(i, i + 160));
const duration = (packets.length * 20) / 1000;
console.log(`Loaded ${packets.length} packets (${duration}s)`);

wss.on("connection", async (socket) => {
  const pc = new RTCPeerConnection({
    codecs: { audio: [new RTCRtpCodecParameters({ mimeType: "audio/PCMU", clockRate: 8000, channels: 1, payloadType: 0 })] }
  });
  const track = new MediaStreamTrack({ kind: "audio" });
  pc.addTransceiver(track, { direction: "sendonly" });

  let connected = false, interval = null, seq = 0, ts = 0, idx = 0, ssrc = Math.random() * 0xffffffff | 0;

  pc.connectionStateChange.subscribe(s => { if (s === "connected") connected = true; });

  const start = () => {
    if (!connected || interval) return;
    if (idx === 0) track.onSourceChanged.execute({ sequenceNumber: 0, timestamp: 0 });
    socket.send(JSON.stringify({ type: "started", duration }));
    interval = setInterval(() => {
      if (idx >= packets.length) {
        clearInterval(interval); interval = null; idx = 0; seq = 0; ts = 0; ssrc = Math.random() * 0xffffffff | 0;
        setTimeout(() => socket.send(JSON.stringify({ type: "ended" })), 500);
        return;
      }
      track.writeRtp(new RtpPacket(new RtpHeader({ payloadType: 0, sequenceNumber: seq++ % 65536, timestamp: ts, ssrc, marker: idx === 0 }), packets[idx++]));
      ts += 160;
    }, 20);
  };

  const stop = () => { if (interval) { clearInterval(interval); interval = null; } };

  await pc.setLocalDescription(await pc.createOffer());
  socket.send(JSON.stringify(pc.localDescription));

  socket.on("message", d => {
    const m = JSON.parse(d);
    if (m.type === "answer") pc.setRemoteDescription(m);
    else if (m.type === "play") start();
    else if (m.type === "pause") stop();
  });

  socket.on("close", () => pc.close());
});

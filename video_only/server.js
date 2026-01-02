const fs = require("fs");
const { Server } = require("ws");
const express = require("express");
const { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RtpPacket } = require("werift");

const app = express();
app.use(express.static("public"));
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

// Load pre-encoded VP8 RTP packets
const data = fs.readFileSync("video.rtp");
const packets = [];
let offset = 0;
while (offset < data.length) {
  const len = data.readUInt32BE(offset);
  packets.push(data.slice(offset + 4, offset + 4 + len));
  offset += 4 + len;
}
const duration = 6.006; // video duration in seconds
const interval = (duration * 1000) / packets.length; // ms per packet
console.log(`Loaded ${packets.length} packets (${duration}s, ${interval.toFixed(1)}ms/pkt)`);

wss.on("connection", async (socket) => {
  const pc = new RTCPeerConnection({
    codecs: { video: [new RTCRtpCodecParameters({ mimeType: "video/VP8", clockRate: 90000, payloadType: 96 })] }
  });
  const track = new MediaStreamTrack({ kind: "video" });
  pc.addTransceiver(track, { direction: "sendonly" });

  let connected = false, timer = null, idx = 0;
  let seq = 0, ssrc = Math.random() * 0xffffffff | 0;
  const baseTs = RtpPacket.deSerialize(packets[0]).header.timestamp;

  pc.connectionStateChange.subscribe(s => { if (s === "connected") connected = true; });

  const start = () => {
    if (!connected || timer) return;
    if (idx === 0) track.onSourceChanged.execute({ sequenceNumber: 0, timestamp: 0 });
    socket.send(JSON.stringify({ type: "started", duration }));
    timer = setInterval(() => {
      if (idx >= packets.length) {
        clearInterval(timer); timer = null;
        idx = 0; seq = 0; ssrc = Math.random() * 0xffffffff | 0;
        setTimeout(() => socket.send(JSON.stringify({ type: "ended" })), 500);
        return;
      }
      const rtp = RtpPacket.deSerialize(packets[idx++]);
      rtp.header.ssrc = ssrc;
      rtp.header.sequenceNumber = seq++ % 65536;
      rtp.header.timestamp = (rtp.header.timestamp - baseTs) >>> 0;
      track.writeRtp(rtp);
    }, interval);
  };

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  await pc.setLocalDescription(await pc.createOffer());
  socket.send(JSON.stringify(pc.localDescription));

  socket.on("message", d => {
    const m = JSON.parse(d);
    if (m.type === "answer") pc.setRemoteDescription(m);
    else if (m.type === "play") start();
    else if (m.type === "pause") stop();
  });

  socket.on("close", () => { stop(); pc.close(); });
});

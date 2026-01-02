const fs = require("fs");
const { Server } = require("ws");
const express = require("express");
const { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RtpPacket, RtpHeader } = require("werift");

const app = express();
app.use(express.static("public"));
const httpServer = app.listen(3000, () => console.log("http://localhost:3000"));
const wss = new Server({ server: httpServer });

// Load pre-encoded audio (μ-law)
const ulaw = fs.readFileSync("audio.ulaw");
const audioPackets = [];
for (let i = 0; i < ulaw.length; i += 160) audioPackets.push(ulaw.slice(i, i + 160));
const audioDuration = (audioPackets.length * 20) / 1000;

// Load pre-encoded video (VP8 RTP)
const videoData = fs.readFileSync("video.rtp");
const videoPackets = [];
let offset = 0;
while (offset < videoData.length) {
  const len = videoData.readUInt32BE(offset);
  videoPackets.push(videoData.slice(offset + 4, offset + 4 + len));
  offset += 4 + len;
}
const videoDuration = 6.006;
const videoBaseTs = RtpPacket.deSerialize(videoPackets[0]).header.timestamp;

const duration = Math.min(audioDuration, videoDuration);
console.log(`Loaded audio: ${audioPackets.length} pkts, video: ${videoPackets.length} pkts (${duration.toFixed(2)}s) [UNBUNDLED]`);

wss.on("connection", async (socket) => {
  const pc = new RTCPeerConnection({
    bundlePolicy: "max-compat",  // Unbundled - separate transports for audio/video
    codecs: {
      audio: [new RTCRtpCodecParameters({ mimeType: "audio/PCMU", clockRate: 8000, channels: 1, payloadType: 0 })],
      video: [new RTCRtpCodecParameters({ mimeType: "video/VP8", clockRate: 90000, payloadType: 96 })],
    },
  });

  const audioTrack = new MediaStreamTrack({ kind: "audio" });
  const videoTrack = new MediaStreamTrack({ kind: "video" });
  pc.addTransceiver(audioTrack, { direction: "sendonly" });
  pc.addTransceiver(videoTrack, { direction: "sendonly" });

  let connected = false, audioTimer = null, videoTimer = null;
  let audioIdx = 0, audioSeq = 0, audioTs = 0, audioSsrc = Math.random() * 0xffffffff | 0;
  let videoIdx = 0, videoSeq = 0, videoSsrc = Math.random() * 0xffffffff | 0;

  pc.connectionStateChange.subscribe(s => { if (s === "connected") connected = true; });

  const start = () => {
    if (!connected || audioTimer) return;

    // Audio: 20ms intervals
    if (audioIdx === 0) audioTrack.onSourceChanged.execute({ sequenceNumber: 0, timestamp: 0 });
    audioTimer = setInterval(() => {
      if (audioIdx >= audioPackets.length) {
        clearInterval(audioTimer); audioTimer = null;
        audioIdx = 0; audioSeq = 0; audioTs = 0; audioSsrc = Math.random() * 0xffffffff | 0;
        checkEnded();
        return;
      }
      audioTrack.writeRtp(new RtpPacket(
        new RtpHeader({ payloadType: 0, sequenceNumber: audioSeq++ % 65536, timestamp: audioTs, ssrc: audioSsrc, marker: audioIdx === 0 }),
        audioPackets[audioIdx++]
      ));
      audioTs += 160;
    }, 20);

    // Video: evenly spaced over duration
    const videoInterval = (duration * 1000) / videoPackets.length;
    if (videoIdx === 0) videoTrack.onSourceChanged.execute({ sequenceNumber: 0, timestamp: 0 });
    videoTimer = setInterval(() => {
      if (videoIdx >= videoPackets.length) {
        clearInterval(videoTimer); videoTimer = null;
        videoIdx = 0; videoSeq = 0; videoSsrc = Math.random() * 0xffffffff | 0;
        checkEnded();
        return;
      }
      const rtp = RtpPacket.deSerialize(videoPackets[videoIdx++]);
      rtp.header.ssrc = videoSsrc;
      rtp.header.sequenceNumber = videoSeq++ % 65536;
      rtp.header.timestamp = (rtp.header.timestamp - videoBaseTs) >>> 0;
      videoTrack.writeRtp(rtp);
    }, videoInterval);

    socket.send(JSON.stringify({ type: "started", duration }));
  };

  let endedSent = false;
  const checkEnded = () => {
    if (!audioTimer && !videoTimer && !endedSent) {
      endedSent = true;
      setTimeout(() => {
        socket.send(JSON.stringify({ type: "ended" }));
        endedSent = false;
      }, 500);
    }
  };

  const stop = () => {
    if (audioTimer) { clearInterval(audioTimer); audioTimer = null; }
    if (videoTimer) { clearInterval(videoTimer); videoTimer = null; }
  };

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

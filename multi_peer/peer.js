const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const dgram = require("dgram");
const { spawn } = require("child_process");
const {
  RTCPeerConnection,
  MediaStreamTrack,
  RTCRtpCodecParameters,
} = require("werift");

const audioFile = process.argv[2] || "peer0.wav";
const peerId = parseInt(audioFile.match(/\d+/)?.[0] || "0");

console.log(`Peer starting with audio file: ${audioFile}`);

// Read WAV file to get size
const wavPath = path.resolve(__dirname, audioFile);
const wavBuffer = fs.readFileSync(wavPath);
const audioDataLength = wavBuffer.length - 44; // Subtract WAV header

console.log(`Audio file size: ${wavBuffer.length} bytes (audio data: ${audioDataLength} bytes)`);

// Connect to signaling server
const ws = new WebSocket("ws://localhost:3000");

let pc = null;
let dataChannel = null;
let myPeerId = null;
let udpSocket = null;
let ffmpegProcess = null;
let rtpPacketCount = 0;
let totalBytesSent = 0;

ws.on("open", () => {
  console.log("Connected to signaling server");
  ws.send(JSON.stringify({ type: "register", role: "peer", audioFile }));
});

ws.on("message", async (data) => {
  const msg = JSON.parse(data);

  if (msg.type === "id") {
    myPeerId = msg.peerId;
    console.log(`Assigned peer ID: ${myPeerId}`);
    await startConnection();
    return;
  }

  if (msg.type === "answer") {
    console.log("Received answer from receiver");
    await pc.setRemoteDescription(msg.sdp);
    return;
  }

  if (msg.type === "candidate") {
    if (msg.candidate) {
      await pc.addIceCandidate(msg.candidate);
    }
    return;
  }
});

async function startConnection() {
  // Create UDP socket to receive RTP from ffmpeg
  udpSocket = dgram.createSocket("udp4");

  await new Promise((resolve) => {
    udpSocket.bind(0, "127.0.0.1", () => {
      const { port } = udpSocket.address();
      console.log(`UDP listening on port ${port}`);
      resolve();
    });
  });

  const udpPort = udpSocket.address().port;

  // Create PeerConnection with Opus codec
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    codecs: {
      audio: [
        new RTCRtpCodecParameters({
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
          payloadType: 111,
        }),
      ],
      video: [],
    },
  });

  // Create audio track
  const audioTrack = new MediaStreamTrack({ kind: "audio" });

  // Forward RTP packets from ffmpeg to WebRTC track
  udpSocket.on("message", (rtpPacket) => {
    audioTrack.writeRtp(rtpPacket);
    rtpPacketCount++;
    totalBytesSent += rtpPacket.length;
    if (rtpPacketCount % 100 === 0) {
      console.log(`Sent ${rtpPacketCount} RTP packets (${totalBytesSent} bytes)`);
    }
  });

  // Add sendonly transceiver
  const transceiver = pc.addTransceiver(audioTrack, { direction: "sendonly" });
  console.log("Added sendonly audio transceiver");

  // Create DataChannel
  dataChannel = pc.createDataChannel("messages", { ordered: true });
  console.log("Created DataChannel");

  dataChannel.onopen = () => {
    console.log("DataChannel opened");
  };

  dataChannel.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    console.log(`DataChannel message: ${JSON.stringify(msg)}`);

    if (msg.type === "bytes-received") {
      console.log(`\n=== RESULT ===`);
      console.log(`Peer ${myPeerId} (${audioFile})`);
      console.log(`Audio data sent: ${audioDataLength} bytes`);
      console.log(`RTP packets sent: ${rtpPacketCount}`);
      console.log(`Bytes received by browser: ${msg.bytes}`);
      console.log(`==============\n`);

      // Cleanup and exit
      setTimeout(() => {
        if (ffmpegProcess) ffmpegProcess.kill();
        if (udpSocket) udpSocket.close();
        pc.close();
        ws.close();
        process.exit(0);
      }, 1000);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state: ${pc.connectionState}`);

    if (pc.connectionState === "connected" && !ffmpegProcess) {
      console.log("Starting ffmpeg audio encoding...");
      startFfmpeg(wavPath, udpPort);
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      ws.send(JSON.stringify({ type: "candidate", target: "receiver", candidate }));
    }
  };

  // Create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log("Created offer");

  ws.send(JSON.stringify({ type: "offer", target: "receiver", sdp: pc.localDescription }));
  console.log("Sent offer to receiver");
}

function startFfmpeg(audioPath, udpPort) {
  // ffmpeg pipeline to encode WAV to Opus RTP
  const args = [
    "-re", // Read at native frame rate
    "-i", audioPath,
    "-acodec", "libopus",
    "-ar", "48000",
    "-ac", "2",
    "-b:a", "64k",
    "-f", "rtp",
    `rtp://127.0.0.1:${udpPort}`,
  ];

  ffmpegProcess = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

  ffmpegProcess.stderr.on("data", (data) => {
    const line = data.toString();
    if (line.includes("Error") || line.includes("error")) {
      console.log(`[ffmpeg] ${line}`);
    }
  });

  ffmpegProcess.on("exit", (code) => {
    console.log(`ffmpeg finished with code ${code}`);

    // Notify receiver that audio is complete
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify({
        type: "audio-complete",
        peerId: myPeerId,
        totalBytes: audioDataLength,
        packets: rtpPacketCount,
      }));
      console.log("Sent audio-complete message");
    }
  });

  console.log("ffmpeg started");
}

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("Disconnected from signaling server");
});

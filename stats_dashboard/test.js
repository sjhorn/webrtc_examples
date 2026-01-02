const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const videoPath = path.resolve(__dirname, "../renegotiation/video.y4m");
  const audioPath = path.resolve(__dirname, "../renegotiation/audio.wav");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
      `--use-file-for-fake-audio-capture=${audioPath}`,
    ],
  });

  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });

  const page1 = await context.newPage();
  const page2 = await context.newPage();

  await page1.goto("http://localhost:3000");
  await page2.goto("http://localhost:3000");

  console.log("Both pages loaded\n");

  const setStatus = async (msg) => {
    await page1.evaluate((m) => window.setStatus(m), msg);
    await page2.evaluate((m) => window.setStatus(m), msg);
    console.log(`>>> ${msg}`);
  };

  // ========================================
  // START CALL
  // ========================================
  await setStatus("1. STARTING CALL...");
  await page1.evaluate(() => window.startCall());

  // Wait for connection
  await page1.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });
  await page2.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });

  await setStatus("2. CONNECTED - Collecting stats...");
  console.log("    Waiting for stats to accumulate...\n");

  // Let it run for a while to collect stats
  await page1.waitForTimeout(10000);

  // Get stats from page1
  const stats = await page1.evaluate(() => {
    const getValue = (id) => document.getElementById(id)?.textContent || "-";
    return {
      connState: getValue("connState"),
      videoSendBitrate: getValue("videoSendBitrate"),
      videoRecvBitrate: getValue("videoRecvBitrate"),
      videoSendFps: getValue("videoSendFps"),
      videoRecvFps: getValue("videoRecvFps"),
      videoSendRes: getValue("videoSendRes"),
      videoRecvRes: getValue("videoRecvRes"),
      audioSendBitrate: getValue("audioSendBitrate"),
      audioRecvBitrate: getValue("audioRecvBitrate"),
      rtt: getValue("rtt"),
      packetLoss: getValue("packetLoss"),
      jitterBuffer: getValue("jitterBuffer"),
      localCandidateType: getValue("localCandidateType"),
      remoteCandidateType: getValue("remoteCandidateType"),
      protocol: getValue("protocol"),
    };
  });

  console.log("========================================");
  console.log("STATS DASHBOARD SUMMARY (Page 1)");
  console.log("========================================\n");

  console.log("Connection:");
  console.log(`  State: ${stats.connState}`);
  console.log(`  Local Candidate: ${stats.localCandidateType}`);
  console.log(`  Remote Candidate: ${stats.remoteCandidateType}`);
  console.log(`  Protocol: ${stats.protocol}\n`);

  console.log("Video (Send):");
  console.log(`  Bitrate: ${stats.videoSendBitrate}`);
  console.log(`  Frame Rate: ${stats.videoSendFps}`);
  console.log(`  Resolution: ${stats.videoSendRes}\n`);

  console.log("Video (Receive):");
  console.log(`  Bitrate: ${stats.videoRecvBitrate}`);
  console.log(`  Frame Rate: ${stats.videoRecvFps}`);
  console.log(`  Resolution: ${stats.videoRecvRes}\n`);

  console.log("Audio:");
  console.log(`  Send Bitrate: ${stats.audioSendBitrate}`);
  console.log(`  Recv Bitrate: ${stats.audioRecvBitrate}\n`);

  console.log("Network:");
  console.log(`  RTT: ${stats.rtt}`);
  console.log(`  Packet Loss: ${stats.packetLoss}`);
  console.log(`  Jitter Buffer: ${stats.jitterBuffer}\n`);

  // Continue running to show live updates
  await setStatus("3. RUNNING - Watch live stats updates");
  console.log("    Streaming for 10 more seconds...\n");
  await page1.waitForTimeout(10000);

  // Final stats
  const finalStats = await page1.evaluate(() => {
    return {
      videoPacketsSent: document.getElementById("videoPacketsSent")?.textContent || "0",
      framesDropped: document.getElementById("framesDropped")?.textContent || "0",
      duration: document.getElementById("duration")?.textContent || "0:00",
    };
  });

  console.log("Final Stats:");
  console.log(`  Duration: ${finalStats.duration}`);
  console.log(`  Video Packets Sent: ${finalStats.videoPacketsSent}`);
  console.log(`  Frames Dropped: ${finalStats.framesDropped}\n`);

  await setStatus("TEST COMPLETE");
  console.log("PASS: Stats dashboard test completed\n");

  await page1.waitForTimeout(3000);
  await browser.close();
})();

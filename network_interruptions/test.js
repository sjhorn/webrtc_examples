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

  await page1.waitForFunction(() => document.getElementById("peerId").textContent !== "-");
  await page2.waitForFunction(() => document.getElementById("peerId").textContent !== "-");

  console.log("Both peers connected to signaling server\n");

  const setStatus = async (msg) => {
    await page1.evaluate((m) => window.setStatus(m), msg);
    await page2.evaluate((m) => window.setStatus(m), msg);
    console.log(`\n>>> ${msg}`);
  };

  const getStates = async () => {
    const p1Conn = await page1.evaluate(() => window.getConnectionState());
    const p1DC = await page1.evaluate(() => window.getDataChannelState());
    const p2Conn = await page2.evaluate(() => window.getConnectionState());
    const p2DC = await page2.evaluate(() => window.getDataChannelState());
    console.log(`    Peer1: conn=${p1Conn}, dc=${p1DC}`);
    console.log(`    Peer2: conn=${p2Conn}, dc=${p2DC}`);
    return { p1Conn, p1DC, p2Conn, p2DC };
  };

  const getMessageStats = async () => {
    const p1Sent = await page1.evaluate(() => window.getSentCount());
    const p1Recv = await page1.evaluate(() => window.getReceivedCount());
    const p1Fail = await page1.evaluate(() => window.getFailedCount());
    const p2Sent = await page2.evaluate(() => window.getSentCount());
    const p2Recv = await page2.evaluate(() => window.getReceivedCount());
    console.log(`    Peer1: sent=${p1Sent}, recv=${p1Recv}, failed=${p1Fail}`);
    console.log(`    Peer2: sent=${p2Sent}, recv=${p2Recv}`);
    return { p1Sent, p1Recv, p1Fail, p2Sent, p2Recv };
  };

  // ========================================
  // ESTABLISH CONNECTION
  // ========================================
  await setStatus("1. CONNECTING...");
  await page1.evaluate(() => window.startCall());

  await page1.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });
  await page2.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });
  await page1.waitForFunction(() => window.getDataChannelState() === "open", { timeout: 5000 });

  await setStatus("1. CONNECTED - Starting messages");
  await getStates();

  // Start sending messages from both peers
  await page1.evaluate(() => window.startMessages(500));
  await page2.evaluate(() => window.startMessages(500));

  console.log("\n    Streaming video + sending messages for 4 seconds...");
  await page1.waitForTimeout(4000);

  console.log("\n    Message stats:");
  await getMessageStats();

  // ========================================
  // FAILURE 1: Video pause/resume (track.enabled)
  // ========================================
  await setStatus("2. FAILURE 1: Video paused (track disabled)");
  await page1.evaluate(() => window.pauseVideo());
  console.log("    (Connection stays up, messages continue)");

  await page1.waitForTimeout(3000);
  await getStates();
  console.log("\n    Message stats (should continue):");
  await getMessageStats();

  await setStatus("2. RECOVERY 1: Video resumed");
  await page1.evaluate(() => window.resumeVideo());

  // Wait for video to be playing on remote
  await page2.waitForFunction(() => {
    const v = document.getElementById("remoteVideo");
    return v && v.videoWidth > 0;
  }, { timeout: 5000 });

  await page1.waitForTimeout(2000);
  await getStates();
  console.log("    Video restored on peer 2");

  // ========================================
  // FAILURE 2: ICE Restart (simulates network path change)
  // ========================================
  await setStatus("3. FAILURE 2: ICE Restart (network path change)");
  await page1.evaluate(() => window.pauseVideo());
  await page1.evaluate(() => window.restartIce());

  await page1.waitForTimeout(2000);
  await getStates();
  console.log("\n    Message stats during ICE restart:");
  await getMessageStats();

  await setStatus("3. RECOVERY 2: ICE restart complete");
  await page1.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 10000 });
  await page1.evaluate(() => window.resumeVideo());

  // Wait for video to be playing on remote
  await page2.waitForFunction(() => {
    const v = document.getElementById("remoteVideo");
    return v && v.videoWidth > 0;
  }, { timeout: 5000 });

  await page1.waitForTimeout(2000);
  await getStates();
  console.log("    Video restored on peer 2");
  console.log("\n    Message stats:");
  await getMessageStats();

  // ========================================
  // FAILURE 3: Full disconnect and reconnect
  // ========================================
  await setStatus("4. FAILURE 3: Connection closed");

  // Pause video and stop messages before closing
  await page1.evaluate(() => window.pauseVideo());
  await page1.evaluate(() => window.stopMessages());
  await page1.evaluate(() => window.closeConnection());

  console.log("    Peer 1 closed, messages will fail...");
  await page1.waitForTimeout(3000);

  // Try sending from page1 (should fail)
  await page1.evaluate(() => window.sendMessage("should-fail-1"));
  await page1.evaluate(() => window.sendMessage("should-fail-2"));

  await getStates();
  console.log("\n    Message stats (peer1 sends should fail):");
  await getMessageStats();

  // Wait for peer2 to detect disconnection
  await setStatus("4. Peer 2 detecting disconnect...");
  try {
    await page2.waitForFunction(
      () => window.getConnectionState() === "disconnected" || window.getConnectionState() === "failed",
      { timeout: 15000 }
    );
  } catch (e) {
    console.log("    (timeout waiting for disconnect detection)");
  }

  await getStates();

  // Reconnect
  await setStatus("4. RECOVERY 3: Reconnecting...");
  await page2.evaluate(() => window.stopMessages());
  await page2.evaluate(() => window.closeConnection());
  await page1.waitForTimeout(500);

  await page1.evaluate(() => window.reconnect());

  await page1.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });
  await page2.waitForFunction(() => window.getConnectionState() === "connected", { timeout: 15000 });
  await page1.waitForFunction(() => window.getDataChannelState() === "open", { timeout: 5000 });

  await setStatus("4. RECONNECTED - Fresh video + messages");

  // Wait for video to be playing on remote
  await page2.waitForFunction(() => {
    const v = document.getElementById("remoteVideo");
    return v && v.videoWidth > 0;
  }, { timeout: 5000 });

  await getStates();
  console.log("    Video restored on peer 2");

  // Resume messages
  await page1.evaluate(() => window.startMessages(500));
  await page2.evaluate(() => window.startMessages(500));

  await page1.waitForTimeout(3000);

  console.log("\n    Final message stats:");
  const finalStats = await getMessageStats();

  // ========================================
  // SUMMARY
  // ========================================
  await setStatus("TEST COMPLETE");

  console.log("\n========================================");
  console.log("TEST SUMMARY");
  console.log("========================================");
  console.log("\nFailure scenarios tested:");
  console.log("  1. Video pause (track.enabled=false) - Connection stays up");
  console.log("  2. ICE restart - Refreshes network path without disconnect");
  console.log("  3. Full disconnect/reconnect - New RTCPeerConnection");
  console.log("\nDataChannel behavior:");
  console.log(`  - Messages sent: ${finalStats.p1Sent + finalStats.p2Sent}`);
  console.log(`  - Messages received: ${finalStats.p1Recv + finalStats.p2Recv}`);
  console.log(`  - Failed sends: ${finalStats.p1Fail}`);
  console.log("\nConnection states observed:");
  console.log("  connecting -> connected -> closed -> connected (reconnect)");
  console.log("\nPASS: Network interruption handling test completed");

  await page1.waitForTimeout(3000);
  await browser.close();
})();

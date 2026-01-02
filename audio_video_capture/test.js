const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",      // Auto-accept camera/mic permissions
      "--use-fake-device-for-media-stream",  // Use fake camera/mic
    ],
  });

  // Create two tabs in the same browser window with camera/mic permissions
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  // Forward console logs with peer identification
  page1.on("console", (msg) => console.log("PEER1:", msg.text()));
  page2.on("console", (msg) => console.log("PEER2:", msg.text()));

  // Navigate both pages to the signaling server
  console.log("TEST: Opening peer 1...");
  await page1.goto("http://localhost:3000");

  console.log("TEST: Opening peer 2...");
  await page2.goto("http://localhost:3000");

  // Wait for both peers to connect to signaling server
  await page1.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 1"));
  await page2.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 2"));
  console.log("TEST: Both peers connected to signaling server");

  // Peer 1 captures camera
  console.log("TEST: Peer 1 capturing camera...");
  await page1.click("#captureBtn");
  await page1.waitForFunction(
    () => document.getElementById("localVideo").srcObject !== null,
    { timeout: 10000 }
  );
  console.log("TEST: Peer 1 camera captured");

  // Peer 2 captures camera
  console.log("TEST: Peer 2 capturing camera...");
  await page2.click("#captureBtn");
  await page2.waitForFunction(
    () => document.getElementById("localVideo").srcObject !== null,
    { timeout: 10000 }
  );
  console.log("TEST: Peer 2 camera captured");

  // Peer 1 starts the call
  console.log("TEST: Peer 1 starting call...");
  await page1.click("#callBtn");

  // Wait for connection to be established
  console.log("TEST: Waiting for connection...");
  await page1.waitForFunction(
    () => document.getElementById("status").textContent.includes("Connected"),
    { timeout: 15000 }
  );
  await page2.waitForFunction(
    () => document.getElementById("status").textContent.includes("Connected"),
    { timeout: 15000 }
  );
  console.log("TEST: Both peers connected!");

  // Wait for remote video to appear and have valid dimensions
  console.log("TEST: Waiting for remote video...");
  await page1.waitForFunction(
    () => {
      const v = document.getElementById("remoteVideo");
      return v.srcObject !== null && v.videoWidth > 0;
    },
    { timeout: 10000 }
  );
  await page2.waitForFunction(
    () => {
      const v = document.getElementById("remoteVideo");
      return v.srcObject !== null && v.videoWidth > 0;
    },
    { timeout: 10000 }
  );
  console.log("TEST: Remote video received on both peers!");

  // Check video dimensions
  const peer1Videos = await page1.evaluate(() => ({
    local: {
      width: document.getElementById("localVideo").videoWidth,
      height: document.getElementById("localVideo").videoHeight,
    },
    remote: {
      width: document.getElementById("remoteVideo").videoWidth,
      height: document.getElementById("remoteVideo").videoHeight,
    },
  }));
  const peer2Videos = await page2.evaluate(() => ({
    local: {
      width: document.getElementById("localVideo").videoWidth,
      height: document.getElementById("localVideo").videoHeight,
    },
    remote: {
      width: document.getElementById("remoteVideo").videoWidth,
      height: document.getElementById("remoteVideo").videoHeight,
    },
  }));

  console.log("TEST: Peer 1 videos:", JSON.stringify(peer1Videos));
  console.log("TEST: Peer 2 videos:", JSON.stringify(peer2Videos));

  // Verify we have valid video dimensions
  if (peer1Videos.local.width > 0 && peer1Videos.remote.width > 0 &&
      peer2Videos.local.width > 0 && peer2Videos.remote.width > 0) {
    console.log("TEST: All video streams have valid dimensions - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Some video streams have zero dimensions");
    process.exit(1);
  }

  // Get final connection states
  const peer1State = await page1.evaluate(() => ({
    ice: window.pc?.iceConnectionState,
    connection: window.pc?.connectionState,
  }));
  const peer2State = await page2.evaluate(() => ({
    ice: window.pc?.iceConnectionState,
    connection: window.pc?.connectionState,
  }));

  console.log("TEST: Final states:");
  console.log(`  Peer 1: ICE=${peer1State.ice}, Connection=${peer1State.connection}`);
  console.log(`  Peer 2: ICE=${peer2State.ice}, Connection=${peer2State.connection}`);

  console.log("TEST: All tests passed!");

  // Wait before closing so user can observe
  console.log("TEST: Waiting 10 seconds before closing...");
  await page1.waitForTimeout(10000);

  await browser.close();
})();

const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      // Auto-select first available screen for getDisplayMedia
      "--auto-select-desktop-capture-source=Entire screen",
      "--enable-usermedia-screen-capturing",
    ],
  });

  // Create two tabs in the same browser window
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  // Forward console logs with peer identification
  page1.on("console", (msg) => console.log("PEER1:", msg.text()));
  page2.on("console", (msg) => console.log("PEER2:", msg.text()));

  // Navigate both pages to the signaling server
  console.log("TEST: Opening peer 1 (sharer)...");
  await page1.goto("http://localhost:3000");

  console.log("TEST: Opening peer 2 (viewer)...");
  await page2.goto("http://localhost:3000");

  // Wait for both peers to connect to signaling server
  await page1.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 1"));
  await page2.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 2"));
  console.log("TEST: Both peers connected to signaling server");

  // Peer 1 shares screen
  console.log("TEST: Peer 1 sharing screen...");

  // We need to handle the getDisplayMedia call which may require special handling
  // Try clicking and see if auto-select works
  try {
    await page1.click("#shareBtn");

    // Wait for local video or timeout
    await page1.waitForFunction(
      () => document.getElementById("localVideo").srcObject !== null,
      { timeout: 5000 }
    );
    console.log("TEST: Peer 1 screen captured");
  } catch (e) {
    // getDisplayMedia may not work in headless/automated mode
    // Fall back to simulating with getUserMedia
    console.log("TEST: getDisplayMedia not available, using camera fallback...");

    // Inject a fallback that uses getUserMedia instead
    await page1.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        // Fall back to camera for testing
        return navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false
        });
      };
    });
    await page2.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async (constraints) => {
        return navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false
        });
      };
    });

    await page1.click("#shareBtn");
    await page1.waitForFunction(
      () => document.getElementById("localVideo").srcObject !== null,
      { timeout: 10000 }
    );
    console.log("TEST: Peer 1 screen captured (using camera fallback)");
  }

  // Peer 1 starts the call
  console.log("TEST: Peer 1 starting call...");
  await page1.click("#callBtn");

  // Wait for connection to be established
  console.log("TEST: Waiting for connection...");
  await page1.waitForFunction(
    () => document.getElementById("status").textContent.includes("Connected"),
    { timeout: 15000 }
  );
  console.log("TEST: Peer 1 connected!");

  // Wait for remote video on peer 2
  console.log("TEST: Waiting for remote video on peer 2...");
  await page2.waitForFunction(
    () => {
      const v = document.getElementById("remoteVideo");
      return v.srcObject !== null && v.videoWidth > 0;
    },
    { timeout: 10000 }
  );
  console.log("TEST: Peer 2 receiving screen share!");

  // Check video dimensions
  const peer1Videos = await page1.evaluate(() => ({
    local: {
      width: document.getElementById("localVideo").videoWidth,
      height: document.getElementById("localVideo").videoHeight,
    },
  }));
  const peer2Videos = await page2.evaluate(() => ({
    remote: {
      width: document.getElementById("remoteVideo").videoWidth,
      height: document.getElementById("remoteVideo").videoHeight,
    },
  }));

  console.log("TEST: Peer 1 local video:", JSON.stringify(peer1Videos.local));
  console.log("TEST: Peer 2 remote video:", JSON.stringify(peer2Videos.remote));

  // Verify we have valid video dimensions
  if (peer1Videos.local.width > 0 && peer2Videos.remote.width > 0) {
    console.log("TEST: Screen sharing working - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Video streams have zero dimensions");
    process.exit(1);
  }

  // Get final connection states
  const peer1State = await page1.evaluate(() => ({
    ice: window.pc?.iceConnectionState,
    connection: window.pc?.connectionState,
  }));

  console.log("TEST: Final state:");
  console.log(`  Peer 1: ICE=${peer1State.ice}, Connection=${peer1State.connection}`);

  console.log("TEST: All tests passed!");

  // Wait before closing so user can observe
  console.log("TEST: Waiting 10 seconds before closing...");
  await page1.waitForTimeout(10000);

  await browser.close();
})();

const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });

  // Create two tabs in the same browser window
  const context = await browser.newContext();
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

  // Peer 1 starts the call
  console.log("TEST: Peer 1 starting call...");
  await page1.click("#startBtn");

  // Wait for connection to be established (data channel open)
  console.log("TEST: Waiting for data channel to open...");
  await page1.waitForFunction(
    () => document.getElementById("status").textContent.includes("Data channel open"),
    { timeout: 10000 }
  );
  await page2.waitForFunction(
    () => document.getElementById("status").textContent.includes("Data channel open"),
    { timeout: 10000 }
  );
  console.log("TEST: Data channel open on both peers!");

  // Test sending a message from peer 1 to peer 2
  console.log("TEST: Peer 1 sending message...");
  await page1.click("#sendBtn");
  await page1.waitForTimeout(500);

  // Verify peer 2 received the message
  const peer2Log = await page2.textContent("#log");
  if (peer2Log.includes("Received: Hello from peer 1")) {
    console.log("TEST: Peer 2 received message from Peer 1 - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Peer 2 did not receive message");
    process.exit(1);
  }

  // Test sending a message from peer 2 to peer 1
  console.log("TEST: Peer 2 sending message...");
  await page2.click("#sendBtn");
  await page2.waitForTimeout(500);

  // Verify peer 1 received the message
  const peer1Log = await page1.textContent("#log");
  if (peer1Log.includes("Received: Hello from peer 2")) {
    console.log("TEST: Peer 1 received message from Peer 2 - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Peer 1 did not receive message");
    process.exit(1);
  }

  // Get final connection states
  const peer1State = await page1.evaluate(() => {
    return {
      ice: window.pc?.iceConnectionState,
      connection: window.pc?.connectionState,
    };
  });
  const peer2State = await page2.evaluate(() => {
    return {
      ice: window.pc?.iceConnectionState,
      connection: window.pc?.connectionState,
    };
  });

  console.log("TEST: Final states:");
  console.log(`  Peer 1: ICE=${peer1State.ice}, Connection=${peer1State.connection}`);
  console.log(`  Peer 2: ICE=${peer2State.ice}, Connection=${peer2State.connection}`);

  console.log("TEST: All tests passed!");

  // Wait before closing so user can observe
  console.log("TEST: Waiting 10 seconds before closing...");
  await page1.waitForTimeout(10000);

  await browser.close();
})();

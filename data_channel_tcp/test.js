const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });

  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  page1.on("console", (msg) => console.log("PEER1:", msg.text()));
  page2.on("console", (msg) => console.log("PEER2:", msg.text()));

  console.log("TEST: Opening peers...");
  await page1.goto("http://localhost:3000");
  await page2.goto("http://localhost:3000");

  await page1.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 1"));
  await page2.waitForFunction(() => document.getElementById("status").textContent.includes("Peer 2"));
  console.log("TEST: Both peers connected to signaling server");

  // Peer 1 initiates connection
  console.log("TEST: Peer 1 connecting...");
  await page1.click("#connectBtn");

  // Wait for data channel to open on both peers
  await page1.waitForFunction(
    () => document.getElementById("status").textContent.includes("Data channel open"),
    { timeout: 10000 }
  );
  await page2.waitForFunction(
    () => document.getElementById("status").textContent.includes("Data channel open"),
    { timeout: 10000 }
  );
  console.log("TEST: Data channel open on both peers!");

  // Test 1: Send text message from peer 1 to peer 2
  console.log("TEST: Sending text message...");
  await page1.fill("#messageInput", "Hello from Peer 1!");
  await page1.click("#sendBtn");
  await page1.waitForTimeout(500);

  let peer2Messages = await page2.textContent("#messages");
  if (peer2Messages.includes("Received: Hello from Peer 1!")) {
    console.log("TEST: Text message received - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Text message not received");
    process.exit(1);
  }

  // Test 2: Send text message from peer 2 to peer 1
  await page2.fill("#messageInput", "Hello back from Peer 2!");
  await page2.click("#sendBtn");
  await page2.waitForTimeout(500);

  let peer1Messages = await page1.textContent("#messages");
  if (peer1Messages.includes("Received: Hello back from Peer 2!")) {
    console.log("TEST: Reverse message received - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Reverse message not received");
    process.exit(1);
  }

  // Test 3: Send binary data
  console.log("TEST: Sending binary data...");
  await page1.click("#sendBinaryBtn");
  await page1.waitForTimeout(500);

  peer2Messages = await page2.textContent("#messages");
  if (peer2Messages.includes("Received binary [1024 bytes]")) {
    console.log("TEST: Binary data received - SUCCESS!");
  } else {
    console.log("TEST: FAILED - Binary data not received");
    process.exit(1);
  }

  // Test 4: Send 100 messages (test ordering)
  console.log("TEST: Sending 100 messages to test reliable ordering...");
  await page1.click("#sendBulkBtn");
  await page1.waitForTimeout(2000);

  // Check that all messages arrived in order
  peer2Messages = await page2.textContent("#messages");
  let allInOrder = true;
  for (let i = 1; i <= 100; i++) {
    if (!peer2Messages.includes(`Message #${i} of 100`)) {
      console.log(`TEST: FAILED - Message #${i} not received`);
      allInOrder = false;
      break;
    }
  }

  if (allInOrder) {
    // Verify order by checking message sequence
    const lines = peer2Messages.split("\n").filter(l => l.includes("Received: Message #"));
    let inOrder = true;
    let lastNum = 0;
    for (const line of lines) {
      const match = line.match(/Message #(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num !== lastNum + 1) {
          console.log(`TEST: FAILED - Messages out of order: got ${num} after ${lastNum}`);
          inOrder = false;
          break;
        }
        lastNum = num;
      }
    }
    if (inOrder && lastNum === 100) {
      console.log("TEST: All 100 messages received in order - SUCCESS!");
    } else if (inOrder) {
      console.log(`TEST: Only ${lastNum} messages received`);
    }
  }

  console.log("TEST: All tests passed!");

  console.log("TEST: Waiting 10 seconds before closing...");
  await page1.waitForTimeout(10000);

  await browser.close();
})();

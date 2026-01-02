const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const useDart = process.argv.includes("--dart");

(async () => {
  console.log(`Multi-Peer Audio Test (${useDart ? "Dart" : "Node"} peers)\n`);
  console.log("=".repeat(50));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:3000");
  console.log("Browser receiver opened\n");

  // Wait for WebSocket connection
  await page.waitForFunction(() => {
    const log = document.getElementById("log");
    return log && log.innerHTML.includes("WebSocket connected");
  }, { timeout: 10000 });

  console.log("Receiver connected to signaling server\n");

  // Track peer completions
  const results = [];
  let completedPeers = 0;

  // Launch 6 peer scripts
  const peers = [];
  for (let i = 0; i < 6; i++) {
    const audioFile = `peer${i}.wav`;

    let peerProcess;
    if (useDart) {
      peerProcess = spawn("dart", ["run", "peer.dart", audioFile], {
        cwd: __dirname,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      peerProcess = spawn("node", ["peer.js", audioFile], {
        cwd: __dirname,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    peers.push({ process: peerProcess, audioFile, id: i });

    // Capture peer output
    peerProcess.stdout.on("data", (data) => {
      const text = data.toString();
      // Look for result summary
      if (text.includes("Bytes received by browser:")) {
        const match = text.match(/Bytes received by browser: (\d+)/);
        if (match) {
          results.push({ peer: i, audioFile, bytesReceived: parseInt(match[1]) });
          completedPeers++;
          console.log(`[Peer ${i}] Completed: ${match[1]} bytes received by browser`);
        }
      }
    });

    peerProcess.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line && !line.includes("ExperimentalWarning") && !line.includes("deprecated")) {
        console.log(`[Peer ${i} err] ${line.substring(0, 100)}`);
      }
    });

    console.log(`Launched peer ${i} (${audioFile})`);
    await new Promise((r) => setTimeout(r, 300)); // Stagger launches
  }

  console.log("\nWaiting for all peers to send audio...\n");

  // Wait for all peers to complete (with timeout)
  const startTime = Date.now();
  while (completedPeers < 6 && Date.now() - startTime < 60000) {
    await new Promise((r) => setTimeout(r, 500));
  }

  // Get browser stats
  const stats = await page.evaluate(() => ({
    totalBytes: window.getTotalBytes(),
  }));

  console.log("\n" + "=".repeat(50));
  console.log("TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`\nPeers completed: ${completedPeers}/6`);
  console.log(`Total bytes received by browser: ${stats.totalBytes.toLocaleString()}`);
  console.log("\nPer-peer results:");
  results.forEach((r) => {
    console.log(`  Peer ${r.peer} (${r.audioFile}): ${r.bytesReceived.toLocaleString()} bytes`);
  });

  if (completedPeers === 6) {
    console.log("\nPASS: All 6 peers completed successfully");
  } else {
    console.log(`\nPARTIAL: Only ${completedPeers} peers completed`);
  }

  // Cleanup
  await new Promise((r) => setTimeout(r, 2000));

  for (const peer of peers) {
    peer.process.kill();
  }

  await browser.close();
})();

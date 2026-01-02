const { chromium } = require("playwright");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const examples = [
  {
    name: "basic_peer",
    title: "Basic Peer Connection",
    description: "Simple peer-to-peer video call between two browsers",
    type: "two-peer",
  },
  {
    name: "audio_only",
    title: "Audio Only",
    description: "Audio-only WebRTC connection without video",
    type: "two-peer",
  },
  {
    name: "video_only",
    title: "Video Only",
    description: "Video-only WebRTC connection without audio",
    type: "two-peer",
  },
  {
    name: "audio_video_bundled",
    title: "Audio + Video (Bundled)",
    description: "Audio and video on a single transport (BUNDLE)",
    type: "two-peer",
  },
  {
    name: "audio_video_unbundled",
    title: "Audio + Video (Unbundled)",
    description: "Audio and video on separate transports",
    type: "two-peer",
  },
  {
    name: "audio_video_capture",
    title: "Audio/Video Capture",
    description: "Capture and display local audio/video streams",
    type: "single",
  },
  {
    name: "screen_sharing",
    title: "Screen Sharing",
    description: "Share screen content via WebRTC",
    type: "single",
  },
  {
    name: "data_channel_tcp",
    title: "DataChannel (TCP-like)",
    description: "Reliable, ordered data channel messaging",
    type: "two-peer",
  },
  {
    name: "data_channel_udp",
    title: "DataChannel (UDP-like)",
    description: "Unreliable, unordered data channel for real-time data",
    type: "two-peer",
  },
  {
    name: "renegotiation",
    title: "Renegotiation",
    description: "Add/remove tracks mid-call without disconnecting",
    type: "two-peer",
  },
  {
    name: "network_interruptions",
    title: "Network Interruptions",
    description: "Handle connection state changes and recovery",
    type: "two-peer",
  },
  {
    name: "multi_peer",
    title: "Multi-Peer",
    description: "Multiple peers sending audio to a central receiver",
    type: "multi-peer",
  },
  {
    name: "stats_dashboard",
    title: "Stats Dashboard",
    description: "Real-time WebRTC metrics: bitrate, FPS, RTT, packet loss",
    type: "two-peer",
  },
];

const videoPath = path.resolve(__dirname, "renegotiation/video.y4m");
const audioPath = path.resolve(__dirname, "renegotiation/audio.wav");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startDartServer(exampleDir) {
  const serverPath = path.join(exampleDir, "server.dart");
  if (!fs.existsSync(serverPath)) {
    console.log(`  No server.dart found in ${exampleDir}`);
    return null;
  }

  const server = spawn("dart", ["server.dart"], {
    cwd: exampleDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  await sleep(1500); // Wait for server to start
  return server;
}

async function captureScreenshot(browser, example, outputPath) {
  const exampleDir = path.join(__dirname, example.name);
  console.log(`\nCapturing: ${example.title}`);

  const server = await startDartServer(exampleDir);
  if (!server) {
    console.log(`  Skipping - no server`);
    return false;
  }

  try {
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
      viewport: { width: 1200, height: 800 },
    });

    if (example.type === "single") {
      // Single page examples
      const page = await context.newPage();
      await page.goto("http://localhost:3000");
      await sleep(2000);

      // For capture example, click start if available
      try {
        await page.click("button", { timeout: 1000 });
      } catch (e) {}

      await sleep(2000);
      await page.screenshot({ path: outputPath, fullPage: false });
      console.log(`  Saved: ${outputPath}`);

    } else if (example.type === "two-peer") {
      // Two peer examples - need to establish connection
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      await page1.goto("http://localhost:3000");
      await page2.goto("http://localhost:3000");
      await sleep(1000);

      // Click start/call button on page1
      try {
        const btn = await page1.$("button");
        if (btn) await btn.click();
      } catch (e) {}

      // Wait for connection
      await sleep(4000);

      // Take screenshot of page1 (shows both local and remote)
      await page1.screenshot({ path: outputPath, fullPage: false });
      console.log(`  Saved: ${outputPath}`);

    } else if (example.type === "multi-peer") {
      // Multi-peer: just show the receiver page
      const page = await context.newPage();
      await page.goto("http://localhost:3000");
      await sleep(2000);
      await page.screenshot({ path: outputPath, fullPage: false });
      console.log(`  Saved: ${outputPath}`);
    }

    await context.close();
    return true;

  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return false;

  } finally {
    if (server) {
      server.kill();
      await sleep(500);
    }
  }
}

async function generateReadme(examples, imagesDir) {
  let readme = `# WebRTC Examples

A collection of WebRTC examples demonstrating various features and patterns, with both **Node.js** and **Dart** signaling servers.

## Examples

| Example | Description |
|---------|-------------|
`;

  for (const ex of examples) {
    readme += `| [${ex.title}](#${ex.name.replace(/_/g, "-")}) | ${ex.description} |\n`;
  }

  readme += `
## Running Examples

Each example can be run with either Node.js or Dart server:

\`\`\`bash
# Using Node.js server
cd example_name
./run.sh

# Using Dart server
cd example_name
./run.sh dart
\`\`\`

## Requirements

- Node.js 18+
- Dart 3.0+
- Playwright (for automated tests)
- ffmpeg (for some examples)

\`\`\`bash
npm install
\`\`\`

---

`;

  for (const ex of examples) {
    const imagePath = `docs/images/${ex.name}.png`;
    const imageExists = fs.existsSync(path.join(__dirname, imagePath));

    readme += `## ${ex.title}

**Directory:** \`${ex.name}/\`

${ex.description}

`;

    if (imageExists) {
      readme += `![${ex.title}](${imagePath})

`;
    }

    readme += `\`\`\`bash
cd ${ex.name}
./run.sh dart
\`\`\`

---

`;
  }

  readme += `## License

MIT
`;

  return readme;
}

(async () => {
  console.log("WebRTC Examples Screenshot Generator\n");
  console.log("=====================================\n");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
      `--use-file-for-fake-audio-capture=${audioPath}`,
    ],
  });

  const imagesDir = path.join(__dirname, "docs/images");

  for (const example of examples) {
    const outputPath = path.join(imagesDir, `${example.name}.png`);
    await captureScreenshot(browser, example, outputPath);
  }

  await browser.close();

  // Generate README
  console.log("\nGenerating README.md...");
  const readme = await generateReadme(examples, imagesDir);
  fs.writeFileSync(path.join(__dirname, "README.md"), readme);
  console.log("README.md created!\n");

  console.log("Done!");
})();

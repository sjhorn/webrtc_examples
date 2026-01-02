const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const videoPath = path.resolve(__dirname, "video.mjpeg");
  const audioPath = path.resolve(__dirname, "audio.wav");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
      `--use-file-for-fake-audio-capture=${audioPath}`,
      "--autoplay-policy=no-user-gesture-required",
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

  console.log("Both peers connected\n");

  // Helper to update status on both pages
  const setStatus = async (msg) => {
    await page1.evaluate((m) => window.setStatus(m), msg);
    await page2.evaluate((m) => window.setStatus(m), msg);
    console.log(`>>> ${msg}`);
  };

  // 0s - Start with VIDEO ONLY
  await setStatus("VIDEO ONLY (no audio)");
  await page1.evaluate(() => window.startVideoOnly());

  await page1.waitForFunction(
    () => document.getElementById("connState").textContent === "connected",
    { timeout: 10000 }
  );
  await page2.waitForFunction(
    () => document.getElementById("remoteVideoCount").textContent === "1",
    { timeout: 5000 }
  );
  console.log("Connection established, peer 2 receiving video\n");

  // Wait 6 seconds with video only
  await page1.waitForTimeout(6000);

  // 6s - Add AUDIO (stays for rest of test)
  await setStatus("VIDEO + AUDIO");
  await page1.evaluate(() => window.addAudio());

  await page2.waitForFunction(
    () => document.getElementById("remoteAudioCount").textContent === "1",
    { timeout: 5000 }
  );
  console.log("Audio added, peer 2 receiving video + audio\n");

  // Wait 4 more seconds (until 10s mark)
  await page1.waitForTimeout(4000);

  // 10s - Layer in audio2.wav for 6 seconds
  await setStatus("VIDEO + AUDIO + AUDIO2 (layered)");
  await page1.evaluate(() => window.addAudio2());

  await page2.waitForFunction(
    () => document.getElementById("remoteAudioCount").textContent === "2",
    { timeout: 5000 }
  );
  console.log("Audio2 added, peer 2 receiving video + 2 audio tracks (mixed)\n");

  // Wait 6 seconds for audio2.wav to play (until 16s mark)
  await page1.waitForTimeout(6000);

  // 16s - Remove audio2 and remove video
  await setStatus("AUDIO ONLY (video removed)");
  await page1.evaluate(() => window.removeAudio2());
  await page1.evaluate(() => window.removeVideo());

  await page1.waitForTimeout(500);
  console.log("Audio2 and video removed, peer 2 receiving audio only\n");

  // Wait 6 seconds with audio only (until 22s mark)
  await page1.waitForTimeout(6000);

  // 22s - Add video back
  await setStatus("VIDEO + AUDIO (video restored)");
  await page1.evaluate(() => window.addVideo());

  // Wait for renegotiation to complete and video to actually play
  await page1.waitForTimeout(2000);
  await page2.waitForFunction(
    () => {
      const v = document.getElementById("remoteVideo");
      return v && v.videoWidth > 0 && v.videoHeight > 0;
    },
    { timeout: 10000 }
  );
  console.log("Video restored, peer 2 receiving video + audio\n");

  // Wait 4 more seconds to observe
  await page1.waitForTimeout(4000);

  // Summary
  const renego = await page1.locator("#renegotiationCount").textContent();
  console.log("=== Test Summary ===");
  console.log(`Total renegotiations: ${renego}`);
  console.log("Timeline:");
  console.log("  0-6s:   VIDEO only");
  console.log("  6-10s:  VIDEO + AUDIO");
  console.log("  10-16s: VIDEO + AUDIO + AUDIO2");
  console.log("  16-22s: AUDIO only");
  console.log("  22-26s: VIDEO + AUDIO");
  console.log("\nPASS: Renegotiation test completed");

  await browser.close();
})();

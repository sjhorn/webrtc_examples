const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:3000');

  // Wait for ready state (both tracks received)
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ready');
  }, { timeout: 10000 });
  console.log('TEST: Page ready');

  await page.waitForTimeout(2000);
  console.log('TEST: Waited 2s for connection');

  // Click play
  console.log('TEST: Clicking play (first time)');
  await page.evaluate(() => { document.querySelector('video').play().catch(() => {}); });

  // Wait for "Playing" status
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Playing');
  }, { timeout: 5000 });
  console.log('TEST: Status shows Playing');

  // Verify video is rendering
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v.videoWidth > 0 && v.videoHeight > 0;
  }, { timeout: 5000 });
  let dims = await page.evaluate(() => {
    const v = document.querySelector('video');
    return { width: v.videoWidth, height: v.videoHeight };
  });
  console.log('TEST: First play video dimensions:', dims);

  // Wait for stream to end
  console.log('TEST: Waiting for stream to end...');
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ended');
  }, { timeout: 15000 });
  console.log('TEST: Stream ended');

  let state = await page.evaluate(() => ({
    paused: document.querySelector('video').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: State after end:', state);

  await page.waitForTimeout(500);

  // Replay test
  console.log('TEST: === REPLAY TEST ===');
  console.log('TEST: Clicking play for replay');

  await page.evaluate(() => {
    const video = document.querySelector('video');
    console.log('Before replay play(): paused=' + video.paused);
    video.play().then(() => console.log('play() promise resolved')).catch(e => console.log('play() rejected: ' + e));
  });

  await page.waitForTimeout(1000);

  state = await page.evaluate(() => ({
    paused: document.querySelector('video').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: State 1s after replay click:', state);

  // Verify video is rendering during replay
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v.videoWidth > 0 && v.videoHeight > 0;
  }, { timeout: 5000 });
  dims = await page.evaluate(() => {
    const v = document.querySelector('video');
    return { width: v.videoWidth, height: v.videoHeight };
  });
  console.log('TEST: Replay video dimensions:', dims);

  // Wait for replay to end
  console.log('TEST: Waiting for replay stream to end...');
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ended');
  }, { timeout: 15000 });
  console.log('TEST: Replay stream ended - SUCCESS!');

  state = await page.evaluate(() => ({
    paused: document.querySelector('video').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: Final state:', state);

  await browser.close();
})();

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Listen to console messages
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:3000');

  // Wait for ready state
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ready');
  }, { timeout: 10000 });
  console.log('TEST: Page ready');

  // Wait for connection to stabilize
  await page.waitForTimeout(2000);
  console.log('TEST: Waited 2s for connection');

  // Click play
  console.log('TEST: Clicking play (first time)');
  await page.evaluate(() => document.querySelector('audio').play());

  // Wait for "Playing" status
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Playing');
  }, { timeout: 5000 });
  console.log('TEST: Status shows Playing');

  // Wait for stream to finish
  console.log('TEST: Waiting for stream to end...');
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ended');
  }, { timeout: 15000 });
  console.log('TEST: Stream ended');

  // Check audio state after end
  let audioState = await page.evaluate(() => ({
    paused: document.querySelector('audio').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: State after end:', audioState);

  // Wait a moment
  await page.waitForTimeout(500);

  // Try to play again
  console.log('TEST: === REPLAY TEST ===');
  console.log('TEST: Clicking play for replay');

  await page.evaluate(() => {
    const audio = document.querySelector('audio');
    console.log('Before replay play(): paused=' + audio.paused);
    audio.play().then(() => {
      console.log('play() promise resolved');
    }).catch(e => {
      console.log('play() promise rejected: ' + e);
    });
  });

  // Wait for playing status
  await page.waitForTimeout(1000);

  audioState = await page.evaluate(() => ({
    paused: document.querySelector('audio').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: State 1s after replay click:', audioState);

  // Wait for second stream to finish
  console.log('TEST: Waiting for replay stream to end...');
  await page.waitForFunction(() => {
    return document.getElementById('status').textContent.includes('Ended');
  }, { timeout: 15000 });
  console.log('TEST: Replay stream ended - SUCCESS!');

  audioState = await page.evaluate(() => ({
    paused: document.querySelector('audio').paused,
    status: document.getElementById('status').textContent,
  }));
  console.log('TEST: Final state:', audioState);

  await browser.close();
})();

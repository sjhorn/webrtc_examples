const { chromium } = require('playwright');

async function runTest() {
  console.log('Testing server at http://localhost:3000');

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Listen for console messages
  page.on('console', msg => {
    console.log(`[Browser] ${msg.text()}`);
  });

  // Navigate to the test page
  console.log('Navigating to test page...');
  await page.goto('http://localhost:3000');

  // Wait for page load
  await page.waitForTimeout(2000);

  // Click the start button
  console.log('Starting all peers...');
  await page.click('#startBtn');

  // Wait for all peers to complete
  console.log('Waiting for all peers to complete...');

  const maxWaitTime = 120000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const doneCount = await page.evaluate(() => {
      const statuses = document.querySelectorAll('.peer-status');
      return Array.from(statuses).filter(s =>
        s.textContent === 'Done' || s.textContent === 'Completed'
      ).length;
    });

    console.log(`  ${doneCount}/6 peers completed`);

    if (doneCount === 6) {
      break;
    }

    await page.waitForTimeout(2000);
  }

  // Collect results
  console.log('\n=== Results ===');
  const results = await page.evaluate(() => {
    const boxes = document.querySelectorAll('.peer-box');
    return Array.from(boxes).map(box => {
      const title = box.querySelector('.peer-title').textContent;
      const status = box.querySelector('.peer-status').textContent;
      const result = box.querySelector('.peer-result').textContent;
      return { title, status, result };
    });
  });

  results.forEach(r => {
    console.log(`${r.title}: ${r.status}`);
    console.log(`  Result: ${r.result.substring(0, 100)}${r.result.length > 100 ? '...' : ''}`);
  });

  // Check if test passed
  const allDone = results.every(r =>
    r.status === 'Done' || r.status === 'Completed'
  );
  const allHaveResults = results.every(r => r.result.length > 0);

  console.log('\n=== Test Summary ===');
  console.log(`All peers completed: ${allDone ? 'PASS' : 'FAIL'}`);
  console.log(`All peers have results: ${allHaveResults ? 'PASS' : 'FAIL'}`);

  // Wait to observe final state
  console.log('Waiting 5 seconds (observe final state)...');
  await page.waitForTimeout(5000);

  // Close browser
  await browser.close();

  return allDone && allHaveResults;
}

runTest()
  .then(passed => {
    console.log(`\nTest ${passed ? 'PASSED' : 'FAILED'}`);
    process.exit(passed ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });

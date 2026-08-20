// M2 verification: clicks Generate, waits for the real API round-trip
// (Cognito-authorized call to /notes/generate, which itself calls Gemini),
// and reports the result. Uses a short video to keep the Gemini call fast.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');
const screenshotDir = path.join(__dirname, '..', '.playwright-screenshots');
mkdirSync(screenshotDir, { recursive: true });

// "Me at the zoo" — 19 seconds, minimizes Gemini cost/latency for this check.
const targetUrl = process.argv[2] ?? 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const page = await context.newPage();

page.on('console', (msg) => console.log(`[page console] ${msg.text()}`));

await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

await page.screenshot({ path: path.join(screenshotDir, 'before-generate.png') });

const clicked = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = host?.shadowRoot?.querySelector('.notesnap-generate-btn');
  if (!btn) return false;
  btn.click();
  return true;
});
console.log('Clicked generate button:', clicked);

if (clicked) {
  // Gemini call can take a while on a real video; poll for a terminal state
  // (ready or error) instead of a fixed sleep.
  let finalState = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const host = document.getElementById('notesnap-sidebar-host');
      const root = host?.shadowRoot;
      if (!root) return null;
      const errorEl = root.querySelector('.notesnap-error p');
      const resultEl = root.querySelector('.notesnap-result');
      const statusEl = root.querySelector('.notesnap-status');
      return {
        error: errorEl ? errorEl.textContent : null,
        result: resultEl ? resultEl.textContent : null,
        status: statusEl ? statusEl.textContent : null,
      };
    });
    console.log('Poll:', JSON.stringify(state));
    if (state?.error != null || state?.result != null) {
      finalState = state;
      break;
    }
  }
  console.log('Final state:', JSON.stringify(finalState));
}

await page.screenshot({ path: path.join(screenshotDir, 'after-generate.png') });
console.log('Screenshots saved.');

await context.close();

// M3 verification: generates notes, screenshots each of the 4 built modes,
// and clicks a timestamp chip to confirm it actually seeks the player.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');
const screenshotDir = path.join(__dirname, '..', '.playwright-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const targetUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

let extensionId = null;
for (const sw of context.serviceWorkers()) {
  const m = sw.url().match(/chrome-extension:\/\/([a-z]+)\//);
  if (m) extensionId = m[1];
}

const page = await context.newPage();
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

if (extensionId) {
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await bgPage.evaluate(async () => { await chrome.storage.local.clear(); });
  await bgPage.close();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  host?.shadowRoot?.querySelector('.notesnap-generate-btn')?.click();
});

// Wait for ready state (mode tabs appear)
let ready = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  ready = await page.evaluate(() => {
    const host = document.getElementById('notesnap-sidebar-host');
    return !!host?.shadowRoot?.querySelector('.notesnap-mode-tabs');
  });
  if (ready) break;
}
console.log('Ready:', ready);

if (ready) {
  const modeIds = await page.evaluate(() => {
    const host = document.getElementById('notesnap-sidebar-host');
    return Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).map((b) => b.textContent);
  });
  console.log('Modes found:', modeIds);

  for (const label of modeIds) {
    await page.evaluate((lbl) => {
      const host = document.getElementById('notesnap-sidebar-host');
      const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === lbl);
      btn?.click();
    }, label);
    await page.waitForTimeout(500);
    const safeLabel = label.toLowerCase().replace(/\s+/g, '-');
    await page.screenshot({ path: path.join(screenshotDir, `mode-${safeLabel}.png`) });
  }

  // Go to Lecture Notes and click the first timestamp chip, then check the video's currentTime
  await page.evaluate(() => {
    const host = document.getElementById('notesnap-sidebar-host');
    const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === 'Lecture Notes');
    btn?.click();
  });
  await page.waitForTimeout(500);

  const beforeTime = await page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime);
  const chipClicked = await page.evaluate(() => {
    const host = document.getElementById('notesnap-sidebar-host');
    const chip = host.shadowRoot.querySelector('.notesnap-chip');
    if (!chip) return false;
    chip.click();
    return true;
  });
  await page.waitForTimeout(500);
  const afterTime = await page.evaluate(() => document.querySelector('video.html5-main-video')?.currentTime);
  console.log('Chip clicked:', chipClicked, 'before:', beforeTime, 'after:', afterTime);
}

await context.close();

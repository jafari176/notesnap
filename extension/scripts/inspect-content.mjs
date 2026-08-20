import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');

const context = await chromium.launchPersistentContext(userDataDir, { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });

// Find the extension's service worker to get its ID and clear storage directly
let extensionId = null;
for (const sw of context.serviceWorkers()) {
  const url = sw.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (match) extensionId = match[1];
}
if (!extensionId) {
  const sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  if (sw) {
    const match = sw.url().match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) extensionId = match[1];
  }
}
console.log('Extension ID:', extensionId);

const page = await context.newPage();

let capturedBody = null;
page.on('response', async (response) => {
  if (response.url().includes('/notes/generate') && response.request().method() === 'POST') {
    try { capturedBody = await response.json(); } catch (e) {}
  }
});

await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// Clear chrome.storage.local via the extension's own background page context
if (extensionId) {
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await bgPage.evaluate(async () => { await chrome.storage.local.clear(); });
  console.log('Cache cleared');
  await bgPage.close();
}

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = host?.shadowRoot?.querySelector('.notesnap-generate-btn');
  btn?.click();
});

for (let i = 0; i < 40 && !capturedBody; i++) {
  await page.waitForTimeout(2000);
}

console.log(JSON.stringify(capturedBody, null, 2));
await context.close();

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');
const screenshotDir = path.join(__dirname, '..', '.playwright-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

let extensionId = null;
for (const sw of context.serviceWorkers()) {
  const m = sw.url().match(/chrome-extension:\/\/([a-z]+)\//);
  if (m) extensionId = m[1];
}
console.log('Extension ID:', extensionId);

const page = await context.newPage();

// Clear any stale auth state
if (extensionId) {
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await bgPage.evaluate(async () => { await chrome.storage.local.clear(); });
  await bgPage.close();
}

await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.screenshot({ path: path.join(screenshotDir, 'signed-out-state.png') });

const gateVisible = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return !!host?.shadowRoot?.querySelector('.notesnap-signin-gate');
});
console.log('Sign-in gate visible:', gateVisible);

const redirectUrl = await page.evaluate(() => {
  // @ts-ignore - accessed from page context via injected extension APIs is not directly available;
  // this just checks the DOM state instead.
  return null;
});
console.log('Redirect URL check skipped (chrome.identity not accessible from page context)');

await context.close();

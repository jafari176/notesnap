// Launches a persistent Chromium context with the unpacked extension loaded,
// navigates to a real YouTube video, and screenshots the result — lets me
// verify UI/CSS fixes myself instead of relying on a manual reload+screenshot
// loop from the user for every change.
//
// Usage: node scripts/verify-sidebar.mjs [youtube-url]
//
// Note: this launches its own isolated Chromium profile (via
// launchPersistentContext, required for MV3 extensions to load), completely
// separate from the user's regular Chrome — it cannot see or control their
// actual browser window.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');
const screenshotDir = path.join(__dirname, '..', '.playwright-screenshots');
mkdirSync(screenshotDir, { recursive: true });

const targetUrl = process.argv[2] ?? 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false, // MV3 extensions require a headed context to load reliably
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const page = await context.newPage();
await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000); // let the content script mount + YouTube's own JS settle

const screenshotPath = path.join(screenshotDir, 'sidebar.png');
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Screenshot saved to ${screenshotPath}`);

// Also report the sidebar host's actual computed position for a fast,
// non-visual sanity check.
const hostBox = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const style = window.getComputedStyle(host);
  return { rect: { top: rect.top, right: rect.right, left: rect.left }, position: style.position };
});
console.log('Sidebar host box:', JSON.stringify(hostBox));

await context.close();

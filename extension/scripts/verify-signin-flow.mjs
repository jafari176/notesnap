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

context.on('page', async (p) => {
  console.log('>>> NEW PAGE EVENT:', p.url());
  p.on('load', () => console.log('>>> new page loaded:', p.url()));
});

const page = await context.newPage();
await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const btn = page.locator('#notesnap-sidebar-host').locator('.notesnap-signin-gate .notesnap-generate-btn');
await btn.click({ timeout: 5000 });

// Poll for new pages for up to 10s
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const pages = context.pages();
  if (pages.length > 2) {
    console.log('Extra page detected at', i, 's:', pages.map(p => p.url()));
    break;
  }
}
console.log('Final page count:', context.pages().length, context.pages().map(p => p.url()));
await context.close();

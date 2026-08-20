import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

const page = await context.newPage();
await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const btn = page.locator('#notesnap-sidebar-host').locator('.notesnap-signin-gate .notesnap-generate-btn');
await btn.click({ timeout: 5000 });

// Give the OAuth popup time to open and either the user could interact or it times out.
// We just want to confirm no "Cannot read properties of undefined" crash occurs.
await page.waitForTimeout(4000);

const errorText = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return host?.shadowRoot?.querySelector('.notesnap-error')?.textContent ?? null;
});
console.log('Error shown (if any):', errorText);

const stillSigningIn = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = host?.shadowRoot?.querySelector('.notesnap-signin-gate .notesnap-generate-btn');
  return btn?.textContent;
});
console.log('Button state:', stillSigningIn);

await context.close();

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

const page = await context.newPage();
await page.goto(`chrome-extension://${extensionId}/options/options.html`);
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(screenshotDir, 'm8-options-signed-out.png') });

const bodyText = await page.evaluate(() => document.body.innerText);
console.log('Options page (signed out):', bodyText);

// Set a fake signed-in state and reload to see the delete-account flow
await page.evaluate(async () => {
  await chrome.storage.local.set({
    'notesnap:auth:tokens': { access_token: 'fake', id_token: 'fake', refresh_token: 'fake', expires_at: Date.now() + 3600000 },
  });
});
await page.reload();
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(screenshotDir, 'm8-options-signed-in.png') });

// Click "Delete my account" to see the confirmation flow
const deleteBtn = page.locator('button', { hasText: 'Delete my account' });
await deleteBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(screenshotDir, 'm8-options-confirm.png') });

// Confirm the "Permanently delete" button is disabled until DELETE is typed
const deleteConfirmBtn = page.locator('button', { hasText: 'Permanently delete' });
const disabledBefore = await deleteConfirmBtn.isDisabled();
console.log('Delete button disabled before typing DELETE:', disabledBefore);

await page.locator('.options-confirm-input').fill('DELETE');
await page.waitForTimeout(200);
const disabledAfter = await deleteConfirmBtn.isDisabled();
console.log('Delete button disabled after typing DELETE:', disabledAfter);

await context.close();

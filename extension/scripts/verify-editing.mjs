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

const testContent = {
  video: { title: 'Elephants at the Zoo', duration_s: 19, channel: 'Test', url: 'https://youtube.com/watch?v=jNQXAC9IVRw' },
  summary: { overview: 'A short video about elephants.', takeaways: [{ text: 'Elephants have long trunks', t_s: 5, uid: 'tk1' }] },
  sections: [{ title: 'Intro', start_s: 0, end_s: 19, content_md: 'Elephants.', content_eli5_md: 'Big elephants!', subsections: [], uid: 's1' }],
  cheatsheet: { key_terms: [], formulas: [], core_concepts: [], exam_traps: [] },
  flashcards: [{ front: 'What do elephants have?', back: 'Long trunks', t_s: 8, uid: 'fc1' }],
  practice_questions: [],
};

const page = await context.newPage();
await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const bgPage = await context.newPage();
await bgPage.goto(`chrome-extension://${extensionId}/options/options.html`);
await bgPage.evaluate(async (content) => {
  await chrome.storage.local.set({
    'notesnap:auth:tokens': { access_token: 'fake', id_token: 'fake', refresh_token: 'fake', expires_at: Date.now() + 3600000 },
    'notesnap:note:jNQXAC9IVRw': { note_id: 'test-note-1', video_id: 'jNQXAC9IVRw', content, dirty: false, updated_at: new Date().toISOString() },
  });
}, testContent);
await bgPage.close();

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('notesnap-sidebar-host')?.shadowRoot?.querySelector('.notesnap-generate-btn')?.click());
await page.waitForTimeout(1000);

// Click the summary takeaway text to enter edit mode
const takeaway = page.locator('#notesnap-sidebar-host').locator('.notesnap-subsection-list .notesnap-editable').first();
await takeaway.click();
await page.waitForTimeout(300);

const inputVisible = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return !!host.shadowRoot.querySelector('.notesnap-editable-input');
});
console.log('Edit input appeared:', inputVisible);

// Type new text and blur to commit
const input = page.locator('#notesnap-sidebar-host').locator('.notesnap-editable-input');
await input.fill('Elephants have VERY long trunks (edited)');
await page.locator('#notesnap-sidebar-host').locator('.notesnap-header').click(); // click elsewhere to blur
await page.waitForTimeout(500);

const newText = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return host.shadowRoot.querySelector('.notesnap-subsection-list .notesnap-editable')?.textContent;
});
console.log('Text after edit:', newText);

// Check sync indicator appeared and shows dirty/syncing/offline (no real API, so should end at offline)
await page.waitForTimeout(2500); // past the 1.5s debounce
const syncText = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return host.shadowRoot.querySelector('.notesnap-sync-indicator')?.textContent;
});
console.log('Sync indicator after debounce:', syncText);

// Verify chrome.storage.local actually has the edited content (local-first write)
const stored = await page.evaluate(async () => {
  const r = await chrome.storage.local.get('notesnap:note:jNQXAC9IVRw');
  return r['notesnap:note:jNQXAC9IVRw']?.content?.summary?.takeaways?.[0]?.text;
});
console.log('Stored takeaway text:', stored);

await page.screenshot({ path: path.join(screenshotDir, 'm6-editing.png') });
await context.close();

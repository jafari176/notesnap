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
  video: { title: 'Git Commands Explained', duration_s: 300, channel: 'Test', url: '' },
  summary: { overview: 'Overview of Git.', takeaways: [] },
  sections: [],
  cheatsheet: {
    key_terms: [
      { term: 'Repository', definition_one_line: 'A project tracked by Git', t_s: 10, uid: 'kt1' },
      { term: 'Commit', definition_one_line: 'A saved snapshot of changes', t_s: 45, uid: 'kt2' },
      { term: 'Branch', definition_one_line: 'An independent line of development', t_s: 90, uid: 'kt3' },
    ],
    formulas: [
      { name: 'Stage file', expression: 'git add <file>', note: '', t_s: 20, uid: 'f1' },
      { name: 'Commit', expression: 'git commit -m "msg"', note: 'always write a clear message', t_s: 50, uid: 'f2' },
    ],
    core_concepts: [
      { text: 'Commits form a directed acyclic graph of history', t_s: 100, uid: 'cc1' },
    ],
    exam_traps: [
      { text: 'git reset --hard permanently discards uncommitted changes. No undo.', t_s: 200, uid: 'et1' },
    ],
  },
  flashcards: [],
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

await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === 'Cheatsheet');
  btn?.click();
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(screenshotDir, 'cheatsheet-redesign.png') });
console.log('Screenshot saved');

await context.close();

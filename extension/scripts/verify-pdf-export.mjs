import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', 'dist');
const userDataDir = path.join(__dirname, '..', '.playwright-profile');
const downloadDir = path.join(__dirname, '..', '.playwright-downloads');
mkdirSync(downloadDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  acceptDownloads: true,
});

let extensionId = null;
for (const sw of context.serviceWorkers()) {
  const m = sw.url().match(/chrome-extension:\/\/([a-z]+)\//);
  if (m) extensionId = m[1];
}

const testContent = {
  video: { title: 'Elephants at the Zoo', duration_s: 19, channel: 'Test', url: 'https://youtube.com/watch?v=jNQXAC9IVRw' },
  summary: { overview: 'A short video about elephants.', takeaways: [{ text: 'Elephants have long trunks', t_s: 5, uid: 'tk1' }] },
  sections: [{ title: 'Intro', start_s: 0, end_s: 19, content_md: 'Elephants have **long trunks**.', content_eli5_md: 'Big elephants!', subsections: [{ title: 'Zoo setting', start_s: 1, uid: 'sub1' }], uid: 's1' }],
  cheatsheet: {
    key_terms: [{ term: 'Elephant', definition_one_line: 'Large mammal', t_s: 2, uid: 'kt1' }],
    formulas: [], core_concepts: [], exam_traps: [],
  },
  flashcards: [{ front: 'What do elephants have?', back: 'Long trunks', t_s: 8, uid: 'fc1' }],
  practice_questions: [{ type: 'mcq', question: 'What is notable?', options: ['Size', 'Trunks', 'Color', 'Speed'], answer: 'Trunks', explanation: 'Highlighted.', t_s: 8, uid: 'pq1' }],
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

// Test PDF export for a few representative modes
for (const modeLabel of ['Lecture Notes', 'Cheatsheet', 'Flashcards', 'Mind Map']) {
  await page.evaluate((lbl) => {
    const host = document.getElementById('notesnap-sidebar-host');
    const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === lbl);
    btn?.click();
  }, modeLabel);
  await page.waitForTimeout(500);

  const exportBtn = page.locator('#notesnap-sidebar-host').locator('.notesnap-export-btn');
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch((e) => ({ error: e.message }));
  await exportBtn.click();
  const download = await downloadPromise;

  if (download.error) {
    console.log(`${modeLabel}: DOWNLOAD FAILED —`, download.error);
    const exportErrorText = await page.evaluate(() => {
      const host = document.getElementById('notesnap-sidebar-host');
      return host.shadowRoot.querySelector('.notesnap-error')?.textContent;
    });
    console.log(`${modeLabel}: on-page error text:`, exportErrorText);
  } else {
    const savePath = path.join(downloadDir, `${modeLabel.replace(/\s+/g, '-')}.pdf`);
    await download.saveAs(savePath);
    const size = statSync(savePath).size;
    console.log(`${modeLabel}: downloaded, ${size} bytes, filename suggested: ${download.suggestedFilename()}`);
  }
}

await context.close();

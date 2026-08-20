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

// A realistic note content object matching the server schema, with enough
// data in each of the 4 new fields (flashcards, practice_questions,
// sections w/ eli5, sections nested for mind map) to exercise M5's renderers.
const testContent = {
  video: { title: 'Elephants at the Zoo', duration_s: 19, channel: 'Test', url: 'https://youtube.com/watch?v=jNQXAC9IVRw' },
  summary: { overview: 'A short video about elephants.', takeaways: [{ text: 'Elephants have long trunks', t_s: 5, uid: 'tk1' }] },
  sections: [
    {
      title: 'Introduction', start_s: 0, end_s: 10,
      content_md: 'The video **opens** with elephants.',
      content_eli5_md: 'This video shows big elephants!',
      subsections: [{ title: 'Zoo setting', start_s: 1, uid: 'sub1' }, { title: 'Elephant intro', start_s: 4, uid: 'sub2' }],
      uid: 's1',
    },
    {
      title: 'Trunks', start_s: 10, end_s: 19,
      content_md: 'Elephants have *long* trunks.',
      content_eli5_md: 'Elephants have super long noses!',
      subsections: [{ title: 'Trunk length', start_s: 12, uid: 'sub3' }],
      uid: 's2',
    },
  ],
  cheatsheet: { key_terms: [], formulas: [], core_concepts: [], exam_traps: [] },
  flashcards: [
    { front: 'What do elephants have?', back: 'Long trunks', t_s: 8, uid: 'fc1' },
    { front: 'Where are the elephants?', back: 'At a zoo', t_s: 2, uid: 'fc2' },
  ],
  practice_questions: [
    { type: 'mcq', question: 'What is notable about elephants?', options: ['Size', 'Trunks', 'Color', 'Speed'], answer: 'Trunks', explanation: 'The speaker highlights trunks.', t_s: 8, uid: 'pq1' },
    { type: 'short_answer', question: 'Where does the video take place?', answer: 'A zoo', explanation: 'Visible enclosure.', t_s: 1, uid: 'pq2' },
  ],
};

const page = await context.newPage();
await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

if (extensionId) {
  const bgPage = await context.newPage();
  await bgPage.goto(`chrome-extension://${extensionId}/options/options.html`);
  await bgPage.evaluate(async (content) => {
    await chrome.storage.local.clear();
    // Fake a signed-in state so SidebarApp skips the SignInGate — inject a
    // token that won't be used for real API calls in this test (cached note
    // path never calls generateNotes).
    await chrome.storage.local.set({
      'notesnap:auth:tokens': { access_token: 'fake', id_token: 'fake', refresh_token: 'fake', expires_at: Date.now() + 3600000 },
      'notesnap:note:jNQXAC9IVRw': { note_id: 'test-note-1', video_id: 'jNQXAC9IVRw', content, dirty: false, updated_at: new Date().toISOString() },
    });
  }, testContent);
  await bgPage.close();
}

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  host?.shadowRoot?.querySelector('.notesnap-generate-btn')?.click();
});
await page.waitForTimeout(1500);

const modeIds = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return Array.from(host?.shadowRoot?.querySelectorAll('.notesnap-mode-tab') ?? []).map((b) => b.textContent);
});
console.log('Modes:', modeIds);

for (const label of ['Flashcards', 'Mind Map', 'Practice Questions', 'ELI5']) {
  if (!modeIds.includes(label)) { console.log('MISSING MODE:', label); continue; }
  await page.evaluate((lbl) => {
    const host = document.getElementById('notesnap-sidebar-host');
    const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === lbl);
    btn?.click();
  }, label);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotDir, `m5-${label.toLowerCase().replace(/\s+/g, '-')}.png`) });
}

// Test flashcard flip + next
await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === 'Flashcards');
  btn?.click();
});
await page.waitForTimeout(300);
const flipResult = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const card = host.shadowRoot.querySelector('.notesnap-flashcard');
  const before = card?.textContent;
  card?.click();
  const after = host.shadowRoot.querySelector('.notesnap-flashcard')?.textContent;
  return { before, after };
});
console.log('Flashcard flip:', JSON.stringify(flipResult));

// Test practice question reveal
await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const btn = Array.from(host.shadowRoot.querySelectorAll('.notesnap-mode-tab')).find((b) => b.textContent === 'Practice Questions');
  btn?.click();
});
await page.waitForTimeout(300);
const revealResult = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  const before = !!host.shadowRoot.querySelector('.notesnap-practice-answer');
  host.shadowRoot.querySelector('.notesnap-reveal-btn')?.click();
  return before;
});
await page.waitForTimeout(300);
const revealAfter = await page.evaluate(() => {
  const host = document.getElementById('notesnap-sidebar-host');
  return !!host.shadowRoot.querySelector('.notesnap-practice-answer');
});
console.log('Answer hidden before:', !revealResult, 'shown after reveal click:', revealAfter);

await context.close();

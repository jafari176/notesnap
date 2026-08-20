# NoteSnap MVP — Feature Spec

*Builds on [COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md). Scope: core loop + all 8 note modes. No screenshots (deferred whole). No auth, no backend, no payments. API key stored locally for dev.*

---

## 1. Core Loop (one tap, eight views)

```
User on a YouTube video → clicks NoteSnap button → ONE Gemini call
→ single rich JSON (drives all 8 modes) → sidebar renders Lecture Notes by default
→ user switches between 8 mode tabs (instant, no re-generation)
→ export any mode as PDF
```

**Rule: one tap = one generation = one quota unit.** Every mode is a different *render* of the same JSON. Switching modes, re-reading, and exporting are always free. Failed generations never count against quota (trust differentiator — see analysis §4).

**No screenshots in MVP.** No capture pass, no inline images, no visual anchors, no image editing UI. All 8 modes are text/markdown only. This removes the `chrome.tabs.captureVisibleTab` pipeline and the crop/seek/restore logic from MVP scope entirely — it's a fast-follow, not a v1 requirement.

**Every item in every mode carries a timestamp reference back to the source video.** Not just Lecture Notes/Outline — cheatsheet terms, flashcards, practice questions, and ELI5 explanations all cite the moment they came from. This is the connective tissue that makes 8 different *views* still feel like one coherent set of notes, and it's a real gap versus every scraper-based competitor (they cite the transcript, not a specific playable moment). See §3 for the schema change and §2 for per-mode requirements.

---

## 2. The 8 Modes

All modes derive from **one Gemini call** and **one JSON document** (schema in §3). No mode requires a second API call in MVP.

| # | Mode | What it is | Derivation |
|---|---|---|---|
| 1 | **Lecture Notes** | Full detailed walkthrough of what was taught, in order, with explanation | Direct render of `sections[]` |
| 2 | **Cheatsheet** | Dense revision sheet: terms, formulas, concepts, exam traps, timeline | Direct render of `cheatsheet` |
| 3 | **Summary** | 1-page overview of the whole video | Direct render of `summary` |
| 4 | **Outline/Skeleton** | Topic → subtopic hierarchy, timestamps only, no explanation | Titles-only render of `sections[]` |
| 5 | **Q&A/Flashcards** | Front/back cards for spaced-repetition review | Direct render of `flashcards[]` |
| 6 | **Mind Map** | Visual hierarchical tree of topics/subtopics/key points | Tree-layout render of `sections[]` (new UI component) |
| 7 | **Exam-Prep/Practice Questions** | Short-answer/MCQ questions testing the material, with answer key | Direct render of `practice_questions[]` |
| 8 | **ELI5/Simplified** | Same content, rewritten at lower complexity/jargon level | Direct render of `eli5` |

Per-mode detail:

**Timestamp rule for this section:** every bullet/card/question/term below carries a `t_s` (or `start_s`/`end_s`) value from the schema in §3. In the sidebar, a timestamp is rendered as a small clickable chip (e.g. `12:40`) next to the item; clicking it seeks the main YouTube player to that instant. In PDF exports, the same value prints as plain text `[12:40]` (not clickable, obviously, but present as a citation so notes stay traceable to the source even on paper).

### 2.1 Lecture Notes
- Sections per topic, each with a timestamp **range** (`start_s`–`end_s`, clickable → seeks player)
- Full-sentence explanations, examples, code blocks (syntax-highlighted), equations
- Ends with the summary paragraph
- PDF: full document, timestamps printed as `[12:40–18:05]`

### 2.2 Cheatsheet
- Key terms & definitions (one line each) — **each term chipped with its `t_s`**
- Formulas/equations, isolated block — **each formula chipped with its `t_s`**
- Core concepts (one-line bullets) — **each bullet chipped with its `t_s`**
- Common mistakes/exam traps — **each trap chipped with its `t_s`**
- Topic timeline: `[02:10] Intro · [08:45] Photosynthesis · [21:30] Krebs cycle`
- PDF: two-column dense layout, target 1 page (2 max), timestamp chip printed inline after each line (e.g. `Osmosis: water moves high→low concentration [14:22]`)

### 2.3 Summary
- 2–4 sentence overview + 3–5 bullet "main takeaways", **each takeaway chipped with its `t_s`** (the moment that takeaway was drawn from)
- Single field, trivial render — but real value as its own tab (quick "is this worth watching" check), and the timestamp chips let a skimming user jump straight to whichever takeaway matters to them
- PDF: half-page, mainly useful as the top of a shared note, not a standalone document

### 2.4 Outline/Skeleton
- Nested list: `Topic → Subtopic → Subtopic`, each with a timestamp, **no body text**
- Purpose: scaffold for the student's own notes, or a fast "does this cover what I need" scan
- PDF: single-column nested list, very short

### 2.5 Q&A/Flashcards
- Array of `{front, back, t_s}` pulled from key terms + core concepts
- Sidebar renders as flippable cards (click/tap to flip), with prev/next; **timestamp chip visible on the back of the card** ("Jump to source →") so a student unsure of an answer can go rewatch that exact moment instead of re-generating or re-watching the whole video
- Not a study-scheduler (no spaced-repetition algorithm in MVP) — just a clean flashcard *viewer*. SRS scheduling is a real fast-follow feature, not MVP.
- PDF: two-column table, front | back | timestamp, printable and cut-able into physical cards

### 2.6 Mind Map
- Root node = video title → topic nodes → subtopic/key-point leaf nodes, from the same `sections[]` hierarchy used in Lecture Notes/Outline
- Requires a real layout engine — recommend a lightweight tree/radial layout lib (no need for full graph physics; this is a strict hierarchy, not an arbitrary graph)
- Interaction: pan/zoom, **click any node (topic or subtopic) to seek the video to that node's `start_s`** — every node is timestamp-linked, not just top-level topics; collapse/expand branches
- Node label shows the timestamp on hover/tap (chip in the node's tooltip)
- PDF export: rendered as a static image (canvas snapshot of the laid-out tree) with timestamps printed under each node label — vector fidelity is a nice-to-have, not required for MVP
- This is the most UI-expensive mode in MVP — budget accordingly (see §8 build order, it's sequenced last)

### 2.7 Exam-Prep/Practice Questions
- 5–10 questions mixing short-answer and MCQ, generated *from* the lecture content (testing understanding, not just recall)
- Each question carries a `t_s` pointing to the section it was drawn from — shown **only after answering/revealing** (so it doesn't give away the answer by proximity, but lets the student go rewatch the relevant bit if they got it wrong)
- Answer key shown/hidden via toggle (don't spoil by default)
- PDF: questions on their own page(s), answer key on a final page with timestamps included (so it can be torn off / hidden while self-testing)

### 2.8 ELI5/Simplified
- Same topic structure as Lecture Notes, same `start_s`/`end_s` per section, but `content_eli5_md` rewritten in plain language, short sentences, analogies in place of jargon
- Positioned for: dense STEM lectures, fast-talking or heavily-accented instructors, students earlier in the prerequisite chain
- PDF: same layout as Lecture Notes export, just simpler prose, same timestamp formatting

---

## 3. Generation JSON Schema (single source for all 8 modes)

```json
{
  "video": { "title": "", "channel": "", "duration_s": 0, "url": "" },
  "summary": {
    "overview": "2-4 sentence overview",
    "takeaways": [ { "text": "bullet", "t_s": 90 } ]
  },
  "sections": [
    {
      "title": "Topic name",
      "start_s": 130, "end_s": 525,
      "content_md": "Full markdown: paragraphs, lists, code fences, $equations$",
      "content_eli5_md": "Same topic, simplified: short sentences, analogies, no jargon",
      "subsections": [
        { "title": "Subtopic name", "start_s": 180 }
      ]
    }
  ],
  "cheatsheet": {
    "key_terms": [ { "term": "", "definition_one_line": "", "t_s": 0 } ],
    "formulas": [ { "name": "", "expression": "", "note": "", "t_s": 0 } ],
    "core_concepts": [ { "text": "one-line bullet", "t_s": 0 } ],
    "exam_traps": [ { "text": "one-line warning", "t_s": 0 } ]
  },
  "flashcards": [
    { "front": "term or question", "back": "definition or answer", "t_s": 0 }
  ],
  "practice_questions": [
    { "type": "mcq", "question": "", "options": ["A","B","C","D"], "answer": "B", "explanation": "", "t_s": 0 },
    { "type": "short_answer", "question": "", "answer": "", "explanation": "", "t_s": 0 }
  ]
}
```

Notes:
- `sections[]` is the backbone — Lecture Notes, Outline, Mind Map, and (via `content_eli5_md`) ELI5 all derive from it. One array, four views, each already timestamped via `start_s`/`end_s`/`subsections[].start_s`.
- **Every leaf item outside `sections[]` now carries its own `t_s`** — cheatsheet terms/formulas/concepts/traps, summary takeaways, flashcards, practice questions. This is what makes the "timestamps everywhere" requirement structural rather than a UI afterthought: if the model doesn't emit `t_s` on an item, the renderer has nothing to chip, so `t_s` should be marked `required` in the `responseSchema` for every one of these object types.
- `subsections[]` gives Outline/Mind Map their nesting without needing a second schema.
- No `visual_anchors` / `screenshot` fields — removed for MVP per no-screenshots decision.
- Single Gemini call must return all of this in one JSON response. This is a big ask of one prompt — see §4 below on why this is the main technical risk in MVP, not the extension plumbing.
- **Validation requirement (new):** on receipt, `lib/gemini.js` should check every leaf item has a `t_s` within `[0, duration_s]`. Items that fail (missing, out of range, or non-numeric) get rendered *without* a clickable chip rather than dropped — losing the jump-to-video affordance on one bullet shouldn't hide the bullet itself.

---

## 4. Primary MVP Risk: One-Call, Eight-Mode Generation Quality

Asking one Gemini call to produce accurate detailed notes **and** a good cheatsheet **and** well-chosen flashcards **and** decent practice questions **and** a simplified rewrite, all in one structured JSON, is more demanding than the original two-mode plan. Two things to watch:

1. **Output size / truncation risk.** Eight modes' worth of content is a large JSON payload. Use Gemini's structured output (`responseSchema`) to constrain shape, and set a generous `maxOutputTokens`. If truncation happens on long lectures, cut ELI5 and Practice Questions first (they're the most token-heavy, least core to the "notes" promise) rather than failing the whole generation — i.e., request them, but if the response is truncated, gracefully render the modes that did arrive and mark ELI5/Practice Questions as "unavailable for this video, try regenerating" rather than showing broken JSON.
2. **Quality dilution.** A single prompt trying to do 8 jobs risks doing all of them mediocrely (this is a known issue with over-loaded prompts). Mitigate with a long, explicit system prompt that gives each field its own clear instructions and a couple of few-shot-style formatting examples per field — not just a one-line ask per field. Plan to iterate on the prompt more than the code once the pipeline runs end-to-end.
3. **Timestamp grounding accuracy.** Every leaf item across all 8 modes now needs a correct `t_s`, not just section boundaries — that's a much finer-grained grounding task (e.g., "which exact second was this flashcard's answer stated?" vs. "roughly when does this 5-minute topic start?"). Expect `t_s` to drift by a few seconds on derived items (a cheatsheet term paraphrased from a 30-second explanation, a flashcard synthesized across two mentions) — this is acceptable and expected; the chip should land the student *near* the right moment, not frame-exact. The prompt should explicitly instruct: "use the timestamp where this specific fact was stated or best demonstrated, not the start of the whole section." The §3 validation clamp (`t_s` within `[0, duration_s]`) catches the failure case where the model hallucinates a timestamp outside the video entirely.

This should be called out explicitly to whoever's building/testing: **the extension plumbing is the easy 30%, the prompt engineering to make all 8 modes genuinely useful (and correctly timestamped) is the hard 70%.**

---

## 5. Sidebar UI (MVP)

- Injected by content script on `youtube.com/watch*` pages, mounted in **Shadow DOM** with its own styles — zero CSS bleed into YouTube (verified competitor complaint: Glasp "looks out of place / breaks layout")
- Collapsible right-side panel; toggle button near the player
- States: idle (Generate button) → generating ("Analyzing video…" single-stage progress, no capture stage) → rendered (**8 mode tabs**, Export PDF button per tab) → error (message + retry, quota not counted)
- Mode tabs, suggested order/grouping: **Summary | Lecture Notes | Outline | Cheatsheet | Flashcards | Mind Map | Practice Questions | ELI5** — ordered roughly by "read this first" → "study aids" → "test yourself"
- **Timestamps are a first-class, reusable UI component** — build one `<TimestampChip t_s={...}/>` used by all 8 mode renderers, not a bespoke implementation per mode. Behavior: renders `mm:ss` (or `h:mm:ss` past 60 min), click → seeks main player and scrolls it into view if scrolled away, keyboard-focusable. Every mode in §2 uses this same component; items missing a valid `t_s` (see §3 validation) render as plain text with no chip rather than a dead/broken link.
- Notes cached in `chrome.storage.local` keyed by video ID — revisiting a video restores all 8 modes instantly, no re-generation, chips included

---

## 6. Long-Video Constraint

Gemini's context caps a single URL call around ~1h of video at default resolution (~3h at `mediaResolution: low`). An 8-mode JSON response is also larger than a 2-mode one, which eats into effective budget. MVP policy:
- ≤ ~60 min → single call, low media resolution
- Longer → "Videos over ~60 min: coming soon" (time-range chunking is fast-follow)
- (Lowered from the original ~75 min estimate to leave headroom for the larger 8-mode output.)

---

## 7. Error Handling (MVP-mandatory, not polish)

| Case | Behavior |
|---|---|
| Not a video page | Button hidden |
| Private/age-restricted/region-locked video | Clear message ("Gemini can't access this video"), no quota counted |
| API failure / timeout | Retry button, error detail collapsed, no quota counted |
| Malformed/truncated JSON | Render whatever modes parsed successfully; mark missing modes "unavailable, try regenerating"; don't fail the whole result for one bad field |
| Live streams / premieres | Unsupported message |

---

## 8. File Structure

```
extension/
  manifest.json          # MV3; permissions: activeTab, storage, scripting
  content/content.js     # video detection, sidebar mount, seek control
  content/sidebar.js     # Shadow DOM UI, 8 mode tabs, rendering, progress states
  content/sidebar.css    # injected into shadow root
  content/modes/         # one renderer per mode (lecture, cheatsheet, summary,
                          #   outline, flashcards, mindmap, practice, eli5)
  background/service-worker.js  # Gemini call, message router
  lib/gemini.js          # prompt + responseSchema + call + JSON validation
  lib/pdf.js             # jsPDF: one layout function per mode (8 layouts)
  lib/storage.js         # notes cache by videoId, API key storage
  options/options.html   # paste API key (dev), quota counter display
```

---

## 9. Out of MVP (explicitly deferred)

Screenshots (capture, inline images, editing) · chat with video · spaced-repetition scheduling for flashcards · note library UI · Supabase auth/sync · backend proxy · Udemy/Coursera fallback · time-range chunking for long videos · Notion/Obsidian export · payments

---

## 10. Build Order

1. Manifest + content script + empty sidebar (Shadow DOM) on YouTube watch pages
2. Gemini call with `responseSchema`-constrained JSON (full 8-field schema), options-page API key
3. Lecture Notes rendering + clickable timestamps (validates the core `sections[]` data is good)
4. Summary, Outline, Cheatsheet rendering (cheap — same `sections[]`/`cheatsheet` data, new views)
5. Flashcards renderer (flip-card UI) + ELI5 renderer (reuses Lecture Notes layout, different field)
6. Practice Questions renderer (question list + toggleable answer key)
7. Mind Map renderer (tree layout component — sequenced last as the highest UI cost)
8. PDF export for all 8 modes
9. Cache + error states (including partial-JSON graceful degradation) + quota counter

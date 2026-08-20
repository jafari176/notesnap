# NoteSnap — Competitor Analysis & Market Research

*Research date: August 2026. Sources: Chrome Web Store listings, Trustpilot, product sites, comparison reviews.*

---

## 1. Competitor Profiles

### 1.1 Named competitors (from project brief)

#### Askify — YouTube Notes
- **Scale:** ~20,000 users, 4.4–4.6★ (195 ratings) on Chrome Web Store
- **Developer:** Sumeru Software Solutions
- **Pricing:** Free (no visible paid tier)
- **What it actually is:** A **manual** note-taking tool, not an AI notes generator. Screenshots with timestamps, floating editor with transparency, markdown + keyboard shortcuts, AutoSnap (auto-screenshots at intervals), dictation in 9 languages, PDF/Markdown export, multi-device sync. Works on YouTube, Udemy, Wikipedia, generic sites.
- **What users say:** Praised for organization and responsive support. It solves *capture*, not *comprehension* — the user still writes the notes.
- **Takeaway:** Not a direct AI competitor. It shows demand for screenshots + timestamps + PDF export as core capture primitives.

#### HoverNotes — the closest true competitor
- **Scale:** ~20,000 users, 4.7★, "500K+ notes captured"
- **Pricing:** Free = **only 20 minutes of AI processing** (YouTube + Bilibili only). Pro $18/mo ($10/mo annual). One-time boosters: $3.99/300 min, $9.99/800 min. 50% edu discount.
- **How it works:** Claims to "watch the video frame-by-frame" instead of parsing transcripts — captures diagrams, code, slides. This is the only competitor doing real **visual** understanding.
- **Features:** AI notes with equations/code blocks, timestamped screenshots (click to seek), Obsidian vault export (markdown), focus mode (ad removal, 0.1x–16x speeds), split view, translation.
- **What users praise:** "Doesn't just use transcripts, it actually watches the video"; syntax-highlighted code snippets; notes clearer than the original presentations; big time savings on lectures.
- **What users complain about:** Repetitive vault-path selection; UI friction (scrolling to next note after screenshots); free-tier AI throttling ("AI features restricted for some minutes"); errors like "This video is unavailable. Error code: 4"; **Obsidian-centric** — storage story depends on an external app.
- **Takeaway:** Validates NoteSnap's core thesis (visual understanding > transcript parsing) but its minutes-based quota is stingy and its storage requires Obsidian. NoteSnap does the same job with **one Gemini API call instead of frame-capture pipelines**, and standalone storage.

#### Clip Insights
- **Scale:** **47 users**, 5.0★ (5 ratings) — pre-traction, effectively no market presence
- **Pricing:** In-app purchases (undisclosed)
- **Features:** Timestamped screenshots + notes, AI video chat, AI summarization, key-point extraction, PDF export of screenshots + notes.
- **Takeaway:** Same feature checklist as everyone else; proves the feature set is easy to list and hard to win with. Distribution/quality is the game, not the checklist.

### 1.2 Market leaders (transcript-based summarizers)

#### NoteGPT — the feature-ecosystem giant
- **Scale:** Large; 3.9★ on Chrome Web Store, **2.3★ on Trustpilot**
- **Pricing:** Free ~10–15 quotas/mo. Pro $9/mo (1,000 basic quotas + 100 premium credits). Unlimited $29/mo (premium credits still capped at 2,800 — a recurring complaint). Max $99/mo.
- **Features:** Summaries, timestamped transcripts, mind maps, flashcards, AI chat, slide generation (PPT/PDF), batch processing (20 videos), 40+ languages, Notion sync, PDF/webpage input.
- **Complaints (loud and consistent):**
  - Billing opacity; "Unlimited" plan isn't unlimited
  - **Quotas deducted for failed/incomplete summaries**
  - Refunds only within 24h or for system errors
  - Suspected fake 5-star reviews
  - 150-minute video cap without subtitles; accuracy drops on technical content
- **Takeaway:** Its moat is the **study-tool ecosystem** (mind maps, flashcards), not summarization quality. Its Trustpilot score is a standing invitation: *trust and billing honesty are differentiators in this market.*

#### Eightify
- **Pricing:** Free = **3 summaries total** (videos < 30 min only), then $9.99/mo (~$120/yr)
- **Reputation:** Highest accuracy in comparison tests (92%), fastest output — but the #1 complaint across all reviews is the paywall speed. Critics: "$120/year to summarize YouTube videos is hard to justify when free alternatives exist."
- **Takeaway:** Proof that accuracy alone doesn't buy goodwill if the free tier feels like a trap.

#### Glasp — YouTube Summary with ChatGPT & Claude
- **Scale:** **2M+ users**, 3.9★ — the volume leader
- **Pricing:** Free (piggybacks on the user's own ChatGPT account; two-window workflow)
- **Complaints:** Fails to generate transcripts (returns empty text); **"UI looks out of place next to YouTube's layout"**; highlights/content **public by default** (privacy issue); missing subtitle translation; users migrating to alternatives.
- **Takeaway:** 2M users proves massive demand at price zero. Its failure modes (transcript scraping breaks, janky UI) are exactly what a Gemini-URL + polished-sidebar approach avoids.

#### Slid
- **Pricing:** 14-day trial, then ~$20/mo (some reviewers cite $40/mo) — "**ridiculously bad value**," "nothing free for students"
- **Model:** Screenshot-centric note-taking + ChatGPT writing; mobile apps
- **Complaints:** After trial you can only *read* old notes until you pay — notes held hostage.
- **Takeaway:** Cautionary tale on pricing students out and on lock-in resentment.

#### Others (generic AI assistants that also summarize YouTube)
| Tool | Free tier | Paid | Notes |
|---|---|---|---|
| Merlin | 51/mo | $19/mo | General AI assistant, not YouTube-specialized |
| MaxAI | 10/day | $9.99–19.99/mo | Feature-broad, generic |
| Summarize | 3/day | $4.99/mo | Minimal |
| Harpa.ai | Limited | $15/mo | Automation-focused |

---

## 2. How These Tools Work Under the Hood

| Approach | Who uses it | Weaknesses |
|---|---|---|
| **Scrape YouTube captions/transcript → send text to LLM** | Glasp, NoteGPT, Eightify, Merlin, MaxAI, Summarize | Misses everything visual (slides, charts, code, diagrams); breaks when captions are missing/auto-generated garbage; breaks when YouTube changes its DOM; "as you can see in this chart" → the AI can't see the chart |
| **Frame capture + vision model** | HoverNotes | Works visually, but expensive → minutes-based quotas (20 free min); client-side capture complexity; per-platform breakage |
| **Manual capture (user screenshots + writes)** | Askify, Slid, Clip Insights | No AI comprehension; user does the work |
| **Gemini YouTube-URL video understanding** (NoteSnap) | *Nobody at scale yet* | Server-side; one API call gets audio + visuals + timestamps; no scraping, no frame pipeline. Constraint: context window limits video length (~1 hr at default resolution, ~3 hrs at low media resolution on a 1M-context model) → long lectures need time-range chunking |

**NoteSnap's structural advantage:** the only architecture that gets *visual* understanding (HoverNotes' selling point) at *transcript-summarizer* cost and simplicity. This window exists because the Gemini YouTube-URL feature is new — early-mover advantage is real but temporary.

---

## 3. Common Features (Table Stakes vs Differentiators)

**Table stakes** — users expect these; absence is a complaint:
1. One-click summary/notes from the current video
2. **Clickable timestamps** that seek the video
3. Sidebar/panel UI on the video page
4. Export — PDF at minimum; Markdown/Notion/Obsidian expected by power users
5. Multi-language output
6. Chat with the video (Q&A) — rapidly becoming table stakes
7. Note history / library

**Ecosystem differentiators** (what winners layer on):
- Flashcards & quizzes (NoteGPT's moat; huge for the student market)
- Mind maps
- Screenshots of key moments embedded in notes
- Batch processing
- Multi-platform (Udemy, Coursera, LinkedIn Learning)

---

## 4. What Users Complain About — Ranked Opportunity List

1. **Transcript blindness** — summaries miss slides/diagrams/code. *(NoteSnap solves natively via Gemini video understanding.)*
2. **Free-tier bait-and-switch** — Eightify's 3-total, NoteGPT's opaque quotas, Slid's read-only lockout. Users are primed to distrust. *(Honest, clearly-counted free tier is a marketing weapon, not a cost.)*
3. **Quota charged on failures** — NoteGPT deducts credits for failed summaries. *(Never charge a failed generation. Trivial to implement, loudly appreciated.)*
4. **Billing opacity & hostile refunds** — NoteGPT's 2.3★ Trustpilot is almost entirely billing complaints. *(Transparent pricing page + easy cancel = review-score moat.)*
5. **Janky UI on YouTube** — Glasp "looks out of place," breaks page layout. *(Matches the brief's "no broken UI side effects" differentiator — verified as a real complaint.)*
6. **Reliability failures** — empty transcripts (Glasp), "video unavailable" errors (HoverNotes). *(Robust error handling + retry + don't-charge-failures.)*
7. **Lock-in** — Obsidian required (HoverNotes), notes hostage after trial (Slid). *(Standalone storage + free export of your own notes, always.)*
8. **Privacy** — Glasp public-by-default. *(Private by default.)*
9. **Feature bloat** — NoteGPT "overwhelming." *(One clean core loop first.)*

---

## 5. Pricing Landscape & NoteSnap Positioning

| Tool | Free | Paid |
|---|---|---|
| Glasp | Unlimited (own ChatGPT) | — |
| Summarize | 3/day | $4.99/mo |
| **NoteSnap (planned)** | **5 full-video notes/mo** | **$5/mo** |
| NoteGPT | ~10/mo | $9/mo |
| Eightify | 3 total | $9.99/mo |
| HoverNotes | 20 AI-min | $10/mo (annual) – $18/mo |
| Harpa | Limited | $15/mo |
| Merlin | 51/mo | $19/mo |
| Slid | trial only | ~$20/mo |

- $5/mo undercuts every *specialized* paid competitor and reads as student-affordable (Slid backlash shows the ceiling).
- Consider HoverNotes-style **one-time credit packs** ($3.99-ish) — students distrust subscriptions; packs monetize the subscription-averse.
- Consider edu discount (HoverNotes does 50%) as an ads angle.
- Free tier of 5 full-video notes/mo is *more generous in substance* than Eightify (3 ever) and comparable to NoteGPT (10 shallow summaries) — because NoteSnap's unit is a full visual-aware note set, not a text summary. Say this loudly in marketing.

## 6. Feature Implications for NoteSnap (input to the feature spec)

**MVP (validated by research):**
- Full-video structured notes: topics, key concepts w/ timestamps, visual/slide descriptions, summary
- Clickable timestamps → seek player
- Clean sidebar that never breaks YouTube's layout (shadow DOM, no global CSS)
- PDF + Markdown export
- Error handling that never eats a quota on failure

**Fast-follow (competitive necessity):**
- Chat with the video (Q&A grounded in the generated notes/video)
- Note history/library (local first, Supabase later)
- Screenshots of key moments auto-embedded at slide changes
- Time-range selection for long lectures (also solves the Gemini context-length constraint)

**Differentiation layer (student-market moat, counter to NoteGPT):**
- Flashcards + quiz generation from notes
- Multi-platform fallback (Udemy/Coursera via frame capture) — the "works everywhere" claim
- Notion/Obsidian export as *options*, never requirements

**Trust layer (cheap to build, hard for incumbents to copy given their reputations):**
- Visible quota counter, failures never counted, cancel anytime, private by default, notes always exportable

---

## Sources
- [Askify — Chrome Web Store](https://chromewebstore.google.com/detail/askify-youtube-notes/njdhimdgnbonemdigklhjeallomiipec)
- [HoverNotes site](https://hovernotes.io/chrome-extension) · [HoverNotes reviews](https://hovernotes.io/en/reviews) · [HoverNotes pricing review (Neura Market)](https://www.neura.market/ai-tools-directory/notes-knowledge-management/hovernotes)
- [Clip Insights — Chrome Web Store](https://chromewebstore.google.com/detail/clip-insights/ccgechmifoecebnimnccgahnoklklilj)
- [NoteGPT — Chrome Web Store](https://chromewebstore.google.com/detail/notegpt-youtube-summary-c/baecjmoceaobpnffgnlkloccenkoibbb) · [NoteGPT guide + complaints (Ekamoira)](https://www.ekamoira.com/blog/notegpt-youtube-summarizer-complete-guide-to-features-limits-better-alternatives-2026) · [NoteGPT Reddit review roundup](https://www.aitooldiscovery.com/guides/notegpt-reddit)
- [Eightify critique (AFFiNE)](https://affine.pro/blog/eightify-youtube-summarizer) · [Eightify review (CreatorEconomyTools)](https://creatoreconomytools.com/tool/eightify)
- [Glasp reviews — Chrome Web Store](https://chromewebstore.google.com/detail/youtube-summary-chatgpt-b/cdjifpfganmhoojfclednjdnnpooaojb/reviews)
- [Slid — Chrome Web Store](https://chromewebstore.google.com/detail/slid-ai-powered-video-not/cgajiilhmpfemmdihjnodpibaffakjhj) · [Slid app reviews](https://findapps.com/apps/slid-video-ai-note-taking-app)
- [8-extension comparison (NoteLM)](https://www.notelm.ai/blog/youtube-summary-chrome-extension)
- [Best AI YouTube summarizers 2026 (ScreenApp)](https://screenapp.io/blog/best-ai-youtube-summarizers)

# Project Brief (Original)

> The original project brief this build started from. Kept for historical context — some details (model name, exact stack choices) evolved during the build; see [ARCHITECTURE.md](ARCHITECTURE.md) for what was actually shipped.

You are helping me build a Chrome extension called NoteSnap (working name).

## Project Mission
Build a Chrome extension that automatically generates structured lecture notes from YouTube videos using the Gemini API's native YouTube URL video understanding feature. The end goal is a SaaS product marketed globally to students via Facebook/Instagram ads.

## Core Idea
When a user is watching a YouTube video lecture, the extension:
1. Detects the YouTube video URL from the active tab
2. Sends that URL directly to Gemini 2.5 Flash API (no downloading, no transcription needed)
3. Gemini analyzes the full video — audio, slides, visuals — and returns structured notes with timestamps
4. Extension displays notes in a clean sidebar
5. User can export notes as a PDF (with timestamps and key screenshots)

## Tech Stack
- Chrome Extension (Manifest V3)
- Vanilla JS or React for the sidebar UI
- Gemini 2.5 Flash API (google/generative-ai SDK) — YouTube URL input mode
- jsPDF + html2canvas for PDF generation
- Supabase for auth + note storage (free tier)
- Node.js backend (Railway/Render) for API key protection and user management
- Stripe or Lemon Squeezy for payments (later phase)

## Architecture
- content_script.js → detects YouTube video, injects sidebar
- background.js → handles API calls to backend
- sidebar UI → renders structured notes, export button
- Backend (Node.js) → proxies Gemini API calls (keeps API key safe)

## Gemini API Usage
Use this exact approach for YouTube videos:
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    { fileData: { fileUri: "https://www.youtube.com/watch?v=VIDEO_ID" } },
    { text: "Extract structured lecture notes with: main topics, key concepts with timestamps, important visual/slide descriptions, and a summary. Return as JSON." }
  ]
});

For non-YouTube platforms (Udemy, Coursera), fall back to:
- Canvas frame capture every 30 seconds → send frames to Gemini Vision
- Extract page subtitles/transcripts if available

## Business Model
- Free tier: 5 AI note generations/month
- Pro: $5/month — unlimited notes, PDF export, search
- Team: $12/month — shared notebooks, collaboration

## Differentiators vs Competitors (Askify, HoverNotes, Clip Insights)
- Works on all platforms (not just YouTube)
- No broken UI side effects on YouTube page
- Honest free tier — no bait and switch
- No external dependencies (no Obsidian required)
- Auto slide-change detection
- Early mover on Gemini YouTube URL API (very new feature)

## Current Phase
MVP — build the core Chrome extension first:
1. YouTube URL detection
2. Gemini API call + structured notes response
3. Sidebar UI to display notes
4. Basic PDF export
Keep it simple. No auth, no backend, no payments in MVP — just the core loop working end to end with a hardcoded API key for testing.

## Code Style
- Clean, modular, well-commented
- Separate files for each concern (content, background, sidebar, api)
- Error handling for: private videos, API failures, non-video pages
- Console logs for debugging during development
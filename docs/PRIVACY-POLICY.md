# NoteSnap — Privacy Policy

*Last updated: [DATE OF PUBLICATION — fill in before publishing]*

This policy describes what data NoteSnap ("the Extension") collects, why, where it's stored, and how you can delete it. It reflects the actual system as built — see [AWS-ARCHITECTURE-SPEC.md](AWS-ARCHITECTURE-SPEC.md) and the `infra/` and `extension/` source for the underlying implementation.

## 1. What NoteSnap Does

NoteSnap is a Chrome extension that generates AI study notes from YouTube videos you choose to analyze. When you click "Generate Notes," the video's URL is sent to Google's Gemini API, which returns structured notes (summaries, flashcards, practice questions, etc.). Notes are stored in your account so you can access them again later and edit them.

## 2. Data We Collect

| Data | Source | Why |
|---|---|---|
| Email address | Google sign-in (via Amazon Cognito) | Identifies your account; used for sign-in only, never for marketing without separate consent |
| YouTube video URL, title, channel, duration | The page you're on when you click Generate | Sent to Gemini for analysis; stored so you can find your notes again |
| Generated note content (summaries, flashcards, etc.) | Gemini's response to the video analysis | The core product — your notes |
| Your edits to notes | Actions you take in the sidebar | Kept in sync with your account so edits aren't lost |

**We do not collect:** your YouTube watch history beyond videos you explicitly generate notes for, your Google contacts, your browsing activity on other sites, or any data from tabs other than the YouTube video you're actively using the extension on.

## 3. How Sign-In Works

NoteSnap uses **Google Sign-In** via **Amazon Cognito** (`chrome.identity.launchWebAuthFlow`, the Chrome-extension-standard OAuth mechanism). We never see or store your Google password — Google handles authentication directly, and Cognito only receives your email address and a token proving you signed in successfully.

## 4. Where Your Data Lives

All infrastructure runs on **Amazon Web Services in the eu-west-1 (Ireland) region** — chosen specifically to keep EU user data resident in the EU.

- **Amazon Cognito**: your account identity (email, sign-in state)
- **Amazon RDS (PostgreSQL)**: metadata about your notes (video title, dates, an internal note ID) — encrypted at rest
- **Amazon S3**: the actual note content (your generated/edited notes) — encrypted at rest, private, never publicly accessible
- **Your device**: a local cache of your notes in the extension's own storage (`chrome.storage.local`), so notes load instantly and work offline; this cache lives only on your device and syncs to the cloud storage above

## 5. Sub-Processors (Third Parties Who Handle Your Data)

| Sub-processor | What they receive | Purpose |
|---|---|---|
| **Google (Gemini API)** | The YouTube video URL you choose to generate notes for | Video analysis — Gemini "watches" the video and returns structured notes. Google's own [API data usage terms](https://ai.google.dev/gemini-api/terms) apply to this processing. |
| **Google (Sign-In)** | Your email address, basic profile info | Authentication only |
| **Amazon Web Services** | All account and note data listed in §4 | Infrastructure hosting — AWS does not use your data for any purpose other than providing the hosting service |

We do not sell your data, share it with advertisers, or use it to train any model ourselves.

## 6. Your Rights

- **Access your data**: every note you've generated is visible in the extension's sidebar at any time.
- **Edit or delete individual notes**: available directly in the sidebar.
- **Delete your entire account**: available in the extension's Settings (options) page. This is a **permanent, irreversible action** that deletes:
  - Every note you've generated or edited
  - Your account record
  - Your sign-in session

  Account deletion is available at all times and does not require contacting support.
- **Data portability**: your notes can be exported as PDF at any time, per-mode, directly from the sidebar.

If you're in the EU/UK, these rights are guaranteed under GDPR Articles 15–20 (access, rectification, erasure, portability). NoteSnap's account-deletion flow is built to satisfy Article 17 (right to erasure) directly — no manual request process needed.

## 7. Data Retention

Your notes and account data are retained until you delete them. There is no automatic expiry. If you stop using the extension without deleting your account, your data remains stored until you either delete it yourself or contact us to request deletion.

## 8. Permissions the Extension Requests, and Why

| Permission | Why NoteSnap needs it |
|---|---|
| `storage` | Local note caching and auth token storage on your device |
| `identity` | The Google sign-in flow (`chrome.identity.launchWebAuthFlow`) |
| `alarms` | Keeping your sign-in session refreshed in the background, so you don't have to re-sign-in constantly |
| Access to `youtube.com` | Detecting which video you're on and injecting the notes sidebar |
| Access to our API domain (AWS) and our sign-in domain (Cognito) | The actual note-generation and sync requests |

NoteSnap does **not** request access to all websites, your browsing history, or your other tabs.

## 9. Children's Privacy

NoteSnap is not directed at children under 13 (or the relevant minimum age in your jurisdiction). We do not knowingly collect data from children.

## 10. Changes to This Policy

If this policy changes, the "Last updated" date at the top will change accordingly. Material changes affecting how your data is used will be communicated via the extension itself where feasible.

## 11. Contact

[CONTACT EMAIL — fill in before publishing]

---

*This document is a starting draft reflecting the system as implemented. Before publishing: fill in the bracketed placeholders, have it reviewed if you're seeking formal legal sign-off, and add it to the Chrome Web Store listing's privacy practices section and a public URL (e.g. your landing page) as required for store submission.*

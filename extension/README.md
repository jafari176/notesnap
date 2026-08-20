# NoteSnap — Chrome Extension

Manifest V3 Chrome extension, built with Vite + [CRXJS](https://crxjs.dev/) + React + TypeScript. Injects an AI-notes sidebar into YouTube watch pages and talks to the AWS backend in [`../infra`](../infra).

See the [root README](../README.md) and [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full system picture — this file covers extension-specific dev workflow only.

## Setup

```bash
npm install
npm run build
```

Load it: `chrome://extensions` → enable Developer Mode → **Load unpacked** → select `dist/`.

`.env.production` is committed and holds only public config (API Gateway URL, Cognito hosted-UI domain, public app client ID — no secrets); it's what `npm run build` uses. `.env.development` / `.env.local` are git-ignored for any local-only overrides.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | oxlint |
| `npm run preview` | Preview the production build |

## Source layout

```
src/
  background/
    service-worker.ts    Message router entry point
    auth-handler.ts        Owns chrome.identity + Cognito token exchange/refresh/storage
    message-router.ts      Typed request/response contract for content-script ↔ background messaging
  content/
    content-script.ts    Entry point injected into youtube.com/watch*
    mount.ts               Shadow DOM host creation + React root mount
    spa-navigation.ts      Detects YouTube's yt-navigate-finish SPA transitions
    youtube-player.ts      seekVideoTo() — drives the actual <video> element
  sidebar/
    SidebarApp.tsx        Root component — auth gate, generate button, tabbed note view
    components/            TimestampChip, ModeTabs, SyncIndicator, NotesLibraryView, SignInGate
    modes/                  One renderer per study mode (see below)
    state/                  Zustand stores: note-store.ts, auth-store.ts
    hooks/                  useResizableWidth.ts
  lib/
    api-client.ts          Typed fetch wrapper (Bearer token, error normalization, generation polling)
    auth.ts                  sendToBackground() wrapper — content scripts can't use chrome.identity directly
    storage.ts                chrome.storage.local cache + normalizeNoteContent() (assigns client-only uid)
    sync.ts                    Debounced push + pull-on-load (local-first editing)
    error-classification.ts   Raw fetch/API errors → user-facing messages
    pdf/                        One jsPDF layout per mode, dispatched from index.ts
  types/
    note-content.ts        Hand-mirrored NoteContent schema (see ../docs/ARCHITECTURE.md for why not shared)
    api.ts                   Request/response types per endpoint
options/
  OptionsApp.tsx          Sign-out, sync status, GDPR account deletion (with confirmation)
```

## Mode renderers

Each file in `sidebar/modes/` follows the same pattern: pick its slice of `NoteContent`, render every leaf with a `t_s`/`start_s` through `<TimestampChip>` (renders as plain text if the timestamp is missing — see the architecture doc's note on `clampTimestamps`), wire edits through `EditableText` into `note-store`'s mutation actions, and have a matching `pdf/*.ts` export layout.

`Eli5View` reuses `LectureNotesView`'s structure parameterized by field name. `MindMapView` is the odd one out — SVG tree layout instead of text, canvas-snapshot PDF export instead of `jsPDF` text layout.

## Manifest & permissions

`manifest.config.ts` defines the manifest in TypeScript (CRXJS). Permissions are intentionally minimal: `storage`, `identity` (for `launchWebAuthFlow`), `alarms` (token-refresh scheduling), and `host_permissions` scoped to `youtube.com`, the API Gateway domain, and the Cognito hosted-UI domain — no `activeTab` or `scripting`, since content-script injection is fully declarative.

The `key` field pins a **stable dev extension ID** (derived from `extension-key.pem`, git-ignored) — without it, `chrome.identity.getRedirectURL()` changes on every unpacked reload, breaking Cognito's registered OAuth `callbackUrls`. The Chrome Web Store-published build gets its own permanent ID at first publish; that ID needs to be added to Cognito's `callbackUrls` in `infra/lib/infra-stack.ts` as an addition (not a replacement) when that happens.

## Testing

No automated test suite — verification during development has been manual (Chrome DevTools) plus ad-hoc [Playwright](https://playwright.dev/) scripts for browser automation (launching a persistent context with `--load-extension`, injecting a fake or real auth token via `chrome-extension://{id}/options/options.html`, then exercising the sidebar). These scripts are written per-change and not kept as a permanent suite; `.playwright-profile/`, `.playwright-screenshots/`, and `.playwright-downloads/` are all git-ignored local artifacts.

If you add a real Playwright suite, remember: a persistent profile's service worker doesn't hot-reload on a `dist/` rebuild — clear `.playwright-profile/` before each verification run after a code change.

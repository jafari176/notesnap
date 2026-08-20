# NoteSnap — Accounts, Editing & Cloud Storage Spec (Phase 2)

*Builds on [MVP-SPEC.md](MVP-SPEC.md). This is the point where the product crosses out of "no backend" MVP scope — editable notes tied to an account require auth + a database. Treat this as Phase 2, built once the core 8-mode generation loop from MVP works end to end.*

---

## 1. What's New Here

MVP notes live only in `chrome.storage.local`, keyed by video ID, read-only after generation. This phase adds:
1. **Google sign-in** — a real user identity
2. **Editing** — modify/delete/add items within any of the 8 modes
3. **Cloud persistence** — notes survive a reinstall, follow the user to a new machine
4. **Fast, frictionless, fully-synced** — edits feel instant *and* nothing is lost, which shapes the architecture below

---

## 2. Auth: Google OAuth via Supabase Auth

**Why Supabase specifically:** it bundles Postgres + Auth + row-level security in one free-tier service, which matters a lot for a solo/small build — no separate identity provider to wire up, no separate database host, and RLS gives you per-user data isolation without hand-rolling authorization checks in application code.

- **Flow:** `chrome.identity.launchWebAuthFlow` (the MV3-correct way to do OAuth in an extension — do **not** use a popup redirect flow meant for regular web apps, it won't work inside the extension's restricted context) → Google consent screen → Supabase exchanges the code for a session → session (JWT access token + refresh token) stored in `chrome.storage.local`
- **Extension manifest requirement:** register the extension's redirect URL (`https://<extension-id>.chromiumapp.org/`) in both the Google Cloud OAuth client and Supabase's allowed redirect URLs
- **Session refresh:** Supabase JWTs expire (default 1h); the client SDK auto-refreshes using the stored refresh token — background service worker should hold the refresh timer since content scripts get torn down/recreated per page
- **Identity:** Supabase's `auth.users` table is authoritative; every note row references `user_id = auth.uid()`, enforced by RLS (below), not by application-layer checks alone
- **No password reset flows, no email verification UI to build** — Google handles both, which is exactly why OAuth-only was the right call for a student audience arriving from an ad click

---

## 3. Data Model (Postgres via Supabase)

```sql
create table notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  video_id      text not null,              -- YouTube video ID
  video_title   text not null,
  video_channel text,
  video_url     text not null,
  duration_s    integer not null,
  content       jsonb not null,             -- the full 8-mode schema from MVP-SPEC §3
  edited        boolean not null default false,  -- has the user modified AI output?
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, video_id)
);

create index notes_user_id_idx on notes (user_id);

alter table notes enable row level security;

create policy "users manage their own notes"
  on notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Design choices worth calling out:**
- **One row per (user, video), not one row per mode.** The whole 8-mode JSON from MVP-SPEC §3 lives in a single `jsonb` column. Editing a flashcard doesn't touch a different table than editing a lecture-notes paragraph — it's the same document, patched in place. This matches the MVP model where all 8 modes are views of one generation result, so storage should mirror that, not fragment it.
- **`unique (user_id, video_id)`** — revisiting a video the user already has notes for loads/updates that row rather than creating a duplicate. This is a deliberate product decision: "my notes for this video," singular, not a history of regenerations. (If you want regeneration history later, that's a separate `note_versions` table, not a schema change here.)
- **`edited` flag** — lets you distinguish "AI output, untouched" from "user has modified this" in the UI (e.g., a small pencil icon) and, later, in analytics (how often do users actually edit vs. just consume?).
- **RLS policy is the actual security boundary.** Even if a client bug or malicious request sends the wrong `user_id`, Postgres itself refuses the row. This is why Supabase was worth the dependency — hand-rolling this in a Node backend means remembering the `WHERE user_id = ?` clause in every single query, forever, with no safety net when someone forgets it.

---

## 4. Editing: Client-Side Model

Per your call, editing stays lightweight: click any paragraph/bullet/card/term to edit its text (contenteditable-style), a delete (×) affordance per item, and an "add" affordance at the end of a list (new bullet, new flashcard, etc.). No rich-text toolbar, no drag-reorder.

- Every editable leaf item needs a **stable client-side id** (not present in the MVP-SPEC schema, which was generation-only) — add a `uid` (short random string, generated client-side on first render) to every array item across all 8 modes. Without a stable id, editing "item 3 in the flashcards array" breaks the moment the array is reordered or an item is deleted.
- Edits mutate the in-memory note object directly (React/vanilla state, whichever the sidebar uses), which immediately re-renders — this is what makes it feel instant, before any network call happens.
- Deleting an item removes it from the array; it does not call the AI again. Adding a new item creates a blank editable row with no `t_s` (renders without a timestamp chip, per the MVP-SPEC validation rule — user-added content has no source moment to cite, which is correct, not a bug).
- **Editing never affects quota.** Only the original generation call costs anything — consistent with the "switching modes and exporting are always free" rule already in MVP-SPEC.

---

## 5. Sync: Local-First, Background Push

This is the direct answer to "fast, frictionless, and fully synced" — the three don't have to trade off against each other if the write path is layered correctly:

```
User edits a note
  → 1. Write immediately to chrome.storage.local (feels instant, <10ms)
  → 2. Mark the note "dirty" + debounce (e.g. 1.5s of no further edits)
  → 3. Background service worker pushes the full `content` jsonb to Supabase
  → 4. On success: clear dirty flag, stamp `updated_at`
  → 5. On failure (offline, expired session, network error): keep dirty flag,
       retry with backoff; local copy is never at risk, only the cloud copy is stale
```

- **Local storage is the source of truth for "what the user sees right now."** Cloud is the source of truth for "what persists across devices." This ordering is what makes it feel frictionless — the UI never waits on a network round-trip to show an edit as saved.
- **Debounce, not per-keystroke sync.** Pushing on every keystroke wastes calls and risks racing writes; 1–2 seconds of idle time after the last edit is the trigger. A manual "synced ✓ / syncing… / offline, will sync" indicator in the sidebar footer keeps this honest to the user rather than hidden.
- **On extension startup / video page load:** pull the cloud copy for that `video_id` if one exists and the local cache is missing or older (`updated_at` compare) — this is what makes "new machine, same notes" work.
- **Conflict handling:** given this is single-user (not the Team/collaboration tier), true conflicts are rare — they'd only happen if the same note was edited on two devices while one was offline. Last-write-wins by `updated_at` is sufficient; don't build merge logic for a collaboration problem that doesn't exist yet in this tier. If a genuine conflict is detected (local dirty + cloud `updated_at` newer than local's last-known-synced timestamp), keep both: overwrite is silent data loss, which is worse than a rare "which version?" prompt.
- **Offline behavior:** local edits keep working (storage.local doesn't need network); the dirty flag just queues until connectivity returns. Never block editing on being online.

---

## 6. Tech Stack (concrete)

| Layer | Choice | Why |
|---|---|---|
| **Auth** | Supabase Auth (Google OAuth provider) | Free tier, no separate identity service, session handling built into the JS SDK |
| **Database** | Supabase Postgres | Same project as auth; RLS ties rows to `auth.uid()` natively; `jsonb` column fits the "one document, many views" model exactly |
| **Client-cloud link** | `@supabase/supabase-js` from the background service worker | Official SDK handles session refresh, retries; keep it in the service worker (persistent-ish context), not content scripts (torn down per page navigation) |
| **Local cache** | `chrome.storage.local` | Already the MVP mechanism; extending it to hold a `dirty` flag + `updated_at` per note is additive, not a rewrite |
| **API key protection** | *Still needs the Node backend proxy from the original brief* — seeing your Gemini key is separate from accounts/storage. Supabase Edge Functions (Deno, same project, free tier) can serve as this proxy instead of standing up a separate Railway/Render service — one less thing to host and pay for | Once real users exist (this phase implies they do — they're signing in), the hardcoded API key from MVP is no longer acceptable; it must move server-side regardless of the storage decision |
| **Hosting** | Supabase Cloud (managed) — no server to provision for DB/auth/functions | Free tier: 500MB DB, 50k monthly active users on auth, 500k Edge Function invocations — comfortably covers MVP-to-early-growth without a bill |

**What this replaces from the original brief:** "Node.js backend (Railway/Render)" becomes optional — Supabase Edge Functions can absorb the API-key-proxy job that the Node backend was for, so you may not need a second hosting provider at all. Keep Railway/Render in reserve only if a proxy function needs something Edge Functions can't do (long-running jobs, heavier compute) — unlikely for a single Gemini API passthrough call.

---

## 7. What This Phase Requires From the Extension (delta from MVP)

- `manifest.json`: add `identity` permission, register OAuth client ID, add Supabase project URL to `host_permissions`
- New `lib/auth.js`: `chrome.identity.launchWebAuthFlow`, session storage, refresh scheduling
- New `lib/sync.js`: dirty-flag tracking, debounced push, pull-on-load, sync status for the UI
- Sidebar: sign-in button (idle state, pre-generation), user avatar/email + "syncing…" indicator (post-generation), per-item edit/delete affordances across all 8 mode renderers, "+ add" affordance per list-type mode
- `lib/storage.js` (from MVP) extended: add `uid` generation on first render, `dirty`/`updated_at` fields per note

---

## 8. Explicitly Still Deferred

Multi-device *real-time* sync (live cross-tab updates) · collaboration/shared notebooks (Team tier) · note version history · rich-text formatting toolbar · offline conflict merge UI (beyond last-write-wins) · account deletion/data export flows (needed before public launch for privacy compliance, but not for personal MVP testing)

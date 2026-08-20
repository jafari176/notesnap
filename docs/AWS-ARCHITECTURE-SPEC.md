# NoteSnap — AWS v1 Architecture Spec

*This is the launch architecture, not a throwaway MVP. Builds on [MVP-SPEC.md](MVP-SPEC.md) (8 note modes, timestamps everywhere, no screenshots yet). Supersedes [ACCOUNTS-AND-STORAGE-SPEC.md](ACCOUNTS-AND-STORAGE-SPEC.md)'s Supabase suggestion — this doc is the AWS-native version, since the decision is AWS end to end.*

---

## 1. System Diagram

```
Chrome Extension (content script + sidebar)
        │
        │  1. Sign in                         2. Generate notes / edit / fetch notes
        ▼                                              ▼
   Amazon Cognito                          Amazon API Gateway (HTTPS, JWT authorizer)
   (Google OAuth federation,                          │
    issues JWT access + refresh tokens)                ├── POST /notes/generate  → Lambda (calls Gemini)
                                                        ├── GET  /notes           → Lambda (reads RDS)
                                                        ├── PUT  /notes/:id       → Lambda (writes RDS + S3)
                                                        └── DELETE /notes/:id     → Lambda

Lambda functions
   │
   ├── generate-notes:  calls Gemini API → writes JSON to S3 → writes metadata row to RDS
   ├── get-notes:       reads metadata from RDS, returns list (no S3 fetch needed for a list view)
   ├── get-note-detail: reads one RDS row → fetches full JSON body from S3 → returns combined
   ├── save-note-edit:  writes updated JSON to S3 (overwrite same key) → updates RDS updated_at
   └── delete-note:     deletes RDS row + S3 object

Amazon RDS (PostgreSQL)          Amazon S3
   notes metadata table             note content JSON, one object per note
   (small, queryable)               (referenced by s3_key column in RDS)
```

**Why this shape, in one sentence per piece:** Cognito owns identity so you never touch password/token security directly; API Gateway is the single authenticated front door; Lambda runs the actual generation/CRUD logic and scales to your bursty ad-driven traffic at near-zero idle cost; RDS holds small queryable metadata; S3 holds the actual (larger, non-queried) note bodies at a fifth of RDS's per-GB storage cost.

---

## 2. Auth: Amazon Cognito

- **User Pool** configured with **Google as a federated identity provider** — Cognito handles the OAuth handshake with Google, not your code.
- **Cognito Hosted UI or direct SDK flow** from the extension: use `chrome.identity.launchWebAuthFlow` to open Cognito's hosted sign-in page (which redirects to Google, then back) — same MV3-correct pattern noted in the earlier storage spec, still applies here regardless of backend.
- **Tokens issued:** Cognito returns a JWT **ID token** (identity claims), **access token** (for calling your API), and **refresh token** (long-lived, used to silently get new access tokens). Store all three in `chrome.storage.local`.
- **API Gateway JWT authorizer** is configured to trust your Cognito User Pool directly — API Gateway verifies the JWT signature and expiry *before your Lambda code even runs*. This means your Lambda functions never parse or validate tokens themselves; they just trust `event.requestContext.authorizer.jwt.claims.sub` as the verified user ID. This is the main win over self-rolled JWT: the verification logic isn't code you wrote and could get wrong.
- **Refresh:** background service worker holds a timer to refresh the access token before it expires (Cognito access tokens default to 1 hour), using the stored refresh token via Cognito's token endpoint.
- **Cost:** free for the first **10,000** monthly active users on the Lite tier (Google/social sign-in counts as "direct/social," which gets this 10K free allowance — not the smaller 50-MAU "federated SAML/OIDC" bucket). Above that: $0.0055/MAU up to 90k, then $0.0046/MAU. See §9 for the full breakdown — a non-issue at launch scale, and still cheap well past it.

---

## 3. Data Layer

### 3.1 RDS PostgreSQL — metadata only

```sql
create table notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,              -- Cognito 'sub' claim
  video_id      text not null,
  video_title   text not null,
  video_channel text,
  video_url     text not null,
  duration_s    integer not null,
  s3_key        text not null,              -- pointer to the actual note JSON in S3
  edited        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, video_id)
);

create index notes_user_id_idx on notes (user_id);
```

- No `jsonb` content column here — that's the point of the split. This table stays small and fast no matter how large note bodies get.
- **Authorization is enforced in Lambda code**, not by RDS itself (unlike Supabase's RLS, plain RDS has no built-in per-row auth) — every query **must** include `WHERE user_id = :cognito_sub`. This is the one place self-managed Postgres asks more of you than a service like Supabase: write this filter into a small shared query-builder helper used by every Lambda, so it's structurally impossible to forget it in a new endpoint, rather than trusting every handler to remember it individually.
- **Instance sizing for launch:** `db.t4g.micro` (free tier eligible for 12 months, ARM-based Graviton — cheaper than the `t3` equivalent) is enough for metadata-only rows at low-thousands of users. This is a real production RDS instance from day one, per your requirement to "stay on the right page" — not a throwaway.
- **Multi-AZ:** skip it for launch (roughly doubles RDS cost for automatic failover you don't need yet at this stage); enable it later once uptime actually matters to revenue. Still take automated daily snapshots (on by default) — that's free and is your actual safety net early on.

### 3.2 S3 — note content

- **Bucket layout:** `notesnap-notes/{user_id}/{note_id}.json` — one object per note, holding the full 8-mode JSON body from MVP-SPEC §3.
- **Access pattern:** Lambda functions read/write via the S3 SDK using an IAM role (not public bucket access — bucket stays fully private, `Block Public Access` on).
- **Versioning:** enable S3 versioning on the bucket. This gives you free, automatic protection against a bad edit overwriting good content — if a sync bug corrupts a note, you can recover the previous version without having built version history yourself.
- **Storage class:** Standard is fine at launch; note JSON is small (tens of KB) and accessed relatively often (users reopening notes) — Infrequent Access classes aren't worth the retrieval-fee complexity yet.
- **Lifecycle:** none needed yet (nothing to expire — deleted notes are deleted, not archived, in v1).

---

## 4. Compute: Lambda (not ECS, not EC2)

**Decision, stated plainly:** Lambda for all application logic in this release — generation, CRUD, auth-adjacent glue. Reasoning recap: your traffic is bursty (silent, then an ad-driven spike, then silent), and the actual per-request compute is short (an outbound API call to Gemini + JSON parsing, not sustained processing) — that combination is precisely what Lambda's scale-to-zero, pay-per-invocation model is priced for. ECS/Fargate wins when utilization is high and steady; that's not this traffic shape, and paying for constantly-running tasks to sit idle most hours would be the actual cost mistake here.

**On the 15-minute ceiling you flagged:** correctly identified as Lambda's hard limit, but not binding for this release — the Gemini video-understanding call itself completes in well under a minute even for a 60-minute lecture (you're waiting on Google's inference, not doing local video processing). Set the Lambda's own timeout to something like 90 seconds and treat anything longer as a real failure to surface to the user, not a signal you need more runtime. **Revisit this decision specifically if/when you build server-side long-video chunking** — that's the one future feature shape where sustained processing time could approach the Lambda ceiling, and it would be the trigger to move *that specific function* (not everything) to Fargate.

**Function list (Node.js runtime, matches the JS-heavy stack already in play):**

| Function | Trigger | Does |
|---|---|---|
| `generate-notes` | `POST /notes/generate` | Calls Gemini with the YouTube URL + 8-mode schema prompt (from MVP-SPEC §3–4), validates/clamps timestamps, writes JSON to S3, writes metadata row to RDS |
| `list-notes` | `GET /notes` | Query RDS for the user's notes (metadata only — title, video_id, dates) for a library/history view |
| `get-note` | `GET /notes/:id` | Fetch RDS row, then fetch its S3 object, return combined |
| `save-note-edit` | `PUT /notes/:id` | Overwrite the S3 object with edited content, bump `updated_at` + `edited=true` in RDS |
| `delete-note` | `DELETE /notes/:id` | Delete S3 object, delete RDS row |

- Package each as a small Node handler; share a `lib/` layer (Lambda Layers) for the RDS client, S3 client, and the `WHERE user_id = ...` query helper mentioned above, so it's one implementation reused across functions, not five copies.
- **Cold starts:** Node Lambdas cold-start in the tens-of-milliseconds-to-low-hundreds range, which is fine for this UX (user already expects a "generating…" wait for `generate-notes`; for `get-note`/`list-notes`, provisioned concurrency is unnecessary at launch traffic — only reconsider if p99 latency becomes a user complaint after real usage data exists).
- **VPC placement:** Lambda functions that talk to RDS need to run inside the same VPC as the RDS instance (RDS isn't public-internet-reachable, correctly). This adds a small cold-start penalty (Hyperplane ENIs have mostly fixed this in current AWS Lambda, but budget for it) — not a reason to avoid RDS, just a fact to know going in.

---

## 5. Why Not Supabase, Given This Decision

The earlier [ACCOUNTS-AND-STORAGE-SPEC.md](ACCOUNTS-AND-STORAGE-SPEC.md) suggested Supabase specifically because it bundles auth + Postgres + storage + RLS in one free-tier project with less setup. That reasoning holds if you wanted to minimize AWS-specific knowledge. Since you're already AWS-familiar and want cost control at the infrastructure level you understand, the AWS-native equivalents (Cognito, RDS, S3, Lambda) give you the same capabilities with more moving parts to wire up yourself, in exchange for: staying inside a platform you already operate in, finer-grained cost control per service, and no third-party platform dependency for your core data. That's a reasonable trade given your stated background — just noting explicitly that it's more assembly, less batteries-included, particularly the loss of RLS (see §3.1) which shifts authorization enforcement from the database layer to application code you must get right in every handler.

---

## 6. Cost Shape at Launch (rough, illustrative)

| Service | Launch-scale monthly cost driver | Approx. floor |
|---|---|---|
| Lambda | Per-invocation + GB-seconds; scales to $0 when idle | ~$0–5/mo at low usage |
| API Gateway | Per-request (~$1/million) | ~$0–1/mo at low usage |
| Cognito | Free to 10k MAU (Lite tier, social login) | $0 (see §9 for scale-up cost) |
| RDS `db.t4g.micro` | Fixed instance-hour cost regardless of traffic | ~$12–13/mo (or $0 for 12mo free tier) |
| S3 | Per-GB storage (~$0.023/GB) + minimal request cost | ~$0–1/mo at low note volume |

**The one always-on cost is RDS** (a database instance runs whether or not anyone's using it, unlike Lambda) — this is expected and correct; it's the metadata index, not the bulk storage, so it stays small and cheap even as note volume (which lives in S3) grows. This is exactly the cost profile you asked for: pay for real usage on the bursty parts (Lambda, API Gateway), pay a small fixed floor for the one piece that needs to always be queryable (RDS), and let the actual bulk of your data (S3) scale at its much cheaper per-GB rate.

---

## 7. Video Handling: No Preprocessing Pipeline Needed (and Why Screenshots Aren't a Lambda Job)

This is worth stating precisely, since it removes a whole category of complexity people often assume this kind of product needs.

### 7.1 Notes generation: no video preprocessing at all
The extension uses Gemini's **YouTube-URL input mode** (per the original brief) — you send Gemini a URL, not a video file. Google's own infrastructure fetches and processes the video server-side. Your Lambda never downloads, decodes, re-encodes, or touches a single video frame. There is no FFmpeg step, no transcoding, no file storage for source video — that entire pipeline simply doesn't exist in this architecture.

**What "resolution" actually means here:** Gemini's API exposes a `mediaResolution` request parameter (`low` / `medium` / `high`) that controls how many tokens-per-second-of-video the model spends internally — it is *not* a statement about the quality of the source file you're uploading (you're not uploading a file at all). Token cost scales roughly 4x from low to high (~70 vs ~280 tokens/sec), with community-reported best practice being that `low` (≈360p-equivalent internal sampling, 1 FPS) captures effectively all the understanding quality needed for lecture-style content — higher settings mostly burn budget for minimal accuracy gain. This is exactly why MVP-SPEC's long-video cutoff (~60 min) was calculated assuming `mediaResolution: low`: it's the parameter that governs how much video fits in one context window, and it's a one-line setting in the `generate-notes` Lambda's Gemini call, not an infrastructure decision.

**Action item for `generate-notes`:** always call Gemini with `mediaResolution: "low"` unless/until real usage shows a specific accuracy problem that justifies the extra cost — don't default to `medium`/`high` speculatively.

### 7.2 Screenshots: client-side only, not a Lambda concern
Screenshots are a different pipeline entirely, and it's important they not get conflated with the notes-generation path above:

- Gemini's video analysis happens on Google's servers; your Lambda receives only the resulting JSON, never frame data. There is nothing in AWS to screenshot *from*.
- A real screenshot must be a pixel-accurate capture of what the user's browser actually rendered at a given timestamp — that pixel data exists **only client-side**, in the extension, at the moment the user (or the extension, briefly seeking on their behalf) is playing the video. No AWS service — Lambda included — has access to a user's rendered browser tab.
- Mechanism (unchanged from earlier planning): the extension seeks the video element to a target timestamp and calls `chrome.tabs.captureVisibleTab`, then crops to the player's bounding box — entirely a browser-extension-API operation, not a server one.

**The split, concretely, when screenshots are built:**
| Step | Where | Why |
|---|---|---|
| Decide *which* timestamps deserve a screenshot (`visual_anchors`) | `generate-notes` Lambda, as part of the Gemini JSON response | This is content judgment — Gemini already "watched" the video; asking it to flag visually-important moments is just another field in the same response, no new pipeline |
| Actually capture the pixels | Extension, client-side, via `chrome.tabs.captureVisibleTab` | Only place the rendered frame exists |
| Upload the captured image | New `save-screenshot` Lambda → S3 (`notesnap-notes/{user_id}/{note_id}/screenshots/{uid}.jpg`), row/pointer added to the note's S3 JSON or a small side table | Ordinary file-upload Lambda work — this part *is* a legitimate future Lambda job, just not "video processing" |

So: no preprocessing pipeline to build now, and when screenshots land, the new AWS work is a small upload endpoint — the hard part of that feature is entirely in the extension, not in AWS.

---

## 9. Cognito Pricing Detail

| Tier | Free MAUs/mo (direct/social login) | Cost above free tier | When to use |
|---|---|---|---|
| **Lite** | 10,000 | $0.0055/MAU (first 90k), then $0.0046/MAU | **Recommended** — cheapest, and Google-only sign-in doesn't need Essentials' extra features |
| **Essentials** | 10,000 | Flat $0.015/MAU | Default for new pools; adds managed hosted-UI polish and richer security config you don't need for a single-provider (Google) login |
| **Plus** | None | $0.020/MAU | Advanced security add-ons (compromised-credential detection, adaptive auth) — not relevant at launch |

- **Google sign-in counts as "direct/social," not "federated SAML/OIDC"** — this matters because federated logins only get 50 free MAUs/month, a completely different (much smaller) allowance. Confirmed from AWS's own pricing documentation. Since the whole plan is Google-only auth, you get the full 10,000 free tier.
- **Illustrative cost at scale (Lite tier):** 50,000 MAU/month → 40,000 billable × $0.0055 ≈ **$220/month**. 200,000 MAU/month → 190,000 billable, first 80k of that at $0.0055 (~$440) + next 110k at $0.0046 (~$506) ≈ **$946/month**. Trivial relative to subscription revenue at those user counts.
- **Other fees, not applicable to this plan:** SMS/MFA (billed via SNS) and email verification (billed via SES) are separate line items — both are skippable since Google handles verified identity and you're not adding phone-based auth.
- **No free-tier expiry:** unlike some AWS free tiers that end after 12 months, Cognito's free MAU allowance is ongoing for as long as you stay under the threshold.

---

## 8. What's Still Deferred

Multi-region/high-availability (Multi-AZ RDS, cross-region S3 replication) · CDN (CloudFront) in front of any static assets · WAF/rate-limiting beyond API Gateway defaults · note version history beyond S3's built-in object versioning · screenshots (still out per MVP-SPEC) — S3 bucket structure already accommodates them when that feature ships, no architecture change needed

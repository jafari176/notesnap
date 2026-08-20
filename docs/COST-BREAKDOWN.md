# NoteSnap — Cost Breakdown (v1 AWS Architecture)

*Covers [AWS-ARCHITECTURE-SPEC.md](AWS-ARCHITECTURE-SPEC.md): Cognito, API Gateway, Lambda, RDS `db.t4g.micro`, S3, plus the Gemini API — the one cost outside AWS itself. Prices are current 2026 us-east-1 on-demand rates.*

---

## 1. The Number That Drives Everything: Cost Per Generation

Every other line in this doc is either a **fixed platform floor** (pay it whether or not anyone uses the app) or **scales with generations**. Gemini is the only cost that scales directly with usage, so it's worth computing precisely rather than rounding.

**Gemini charges by tokens, and video is the dominant cost — not the JSON output.** At `mediaResolution: low` (the setting decided on in the architecture spec), video costs ~70 tokens per second of footage:

| Video length | Video input tokens | + prompt (~2K) | Input cost @ $0.30/M | Output (8-mode JSON, ~4–8K tokens) @ $2.50/M | **Total per generation** |
|---|---|---|---|---|---|
| 15 min | 63,000 | 65,000 | $0.020 | $0.01–0.02 | **≈ $0.03–0.04** |
| 30 min | 126,000 | 128,000 | $0.038 | $0.01–0.02 | **≈ $0.05–0.06** |
| 60 min (MVP cap) | 252,000 | 254,000 | $0.076 | $0.01–0.02 | **≈ $0.09–0.10** |

**Working assumption for this doc: $0.07 per generation**, a blended average across realistic lecture lengths (most lectures run 20–50 min, not all at the 60-min ceiling). This is the single most important number to track once real usage exists — it's the one line that moves if users watch longer videos than expected, and it's worth instrumenting from day one (log actual video duration per generation) rather than assuming the blended average holds.

**Why this matters for pricing:** your Pro tier is $5/month "unlimited." At $0.07/generation, a user needs to generate **~71 notes in a month** before Gemini cost alone exceeds their subscription revenue. A student generating notes for, say, 15–20 lecture videos a month costs you roughly $1.05–$1.40 in Gemini spend against $5 revenue — healthy margin. The economics only get uncomfortable if "unlimited" attracts power users generating 100+ notes/month; worth deciding now whether Pro needs a soft cap (e.g., 200/month, framed as "unlimited for real students") before that becomes a support problem.

---

## 2. AWS Fixed Floor — Paid Regardless of Traffic

Only one service in this architecture has a cost that doesn't scale to zero with zero users:

| Service | Cost | Why it's fixed |
|---|---|---|
| **RDS `db.t4g.micro`** | $0.016/hr × 730 hr ≈ **$11.68/month** | A database instance runs continuously; unlike Lambda it can't scale to zero. This is the one line you pay on day one with zero signups. |
| RDS storage (gp3, metadata only) | ~$0.10–0.50/month at launch volume | Metadata rows are tiny (a few hundred bytes each); storage cost stays negligible even at tens of thousands of notes, since the actual content lives in S3, not here |
| RDS automated backups | $0 | Free allowance covers backups up to the size of the DB — a non-issue at this scale |

**Everything else in the architecture — Lambda, API Gateway, Cognito, S3 — scales to $0 at zero usage.** This is the direct payoff of the Lambda-over-ECS decision from the architecture spec: you are not paying for idle compute capacity, only for the one component (a relational database) that fundamentally can't be serverless in the same way.

---

## 3. Per-Unit AWS Costs (What Scales With Usage)

| Service | Rate | What one generation costs |
|---|---|---|
| **Lambda** (`generate-notes`, ~90s max, 512MB) | $0.20/million requests + $0.0000166667/GB-second (x86; ~20% cheaper on Arm/Graviton) | A ~10–20s actual execution (waiting on Gemini, not local compute) at 512MB ≈ 0.005–0.01 GB-s → **well under $0.001/generation**. First 1M requests + 400,000 GB-seconds every month are free, permanently — most other Lambda functions (`list-notes`, `get-note`, etc.) are fast reads that individually cost fractions of a cent and are fully covered by the free tier at launch volumes. |
| **API Gateway** (HTTP API) | $1.00/million requests (first 300M/mo) | **$0.000001/request** — effectively free until you're deep into millions of monthly calls |
| **S3 storage** | $0.023/GB-month | A note body (20–100KB) costs **~$0.000002/month** to store — a rounding error even at tens of thousands of notes |
| **S3 requests** | $0.005/1,000 PUT · $0.0004/1,000 GET | One generation = 1 PUT (~$0.000005) + subsequent reads at $0.0000004 each — negligible |
| **Cognito** | 10,000 MAU free (Lite tier), then $0.0055/MAU | Not per-generation — billed per unique active user per month, not per note (see §5) |

**Combined AWS infrastructure cost per generation (excluding RDS's fixed floor and Cognito's per-MAU charge): well under $0.001** — three orders of magnitude smaller than the $0.07 Gemini cost. **Gemini is not just the dominant cost, it's effectively the only cost that matters per-generation.** AWS's serverless pieces are, at this usage scale, rounding error next to the AI call itself.

---

## 4. Monthly Cost at Three Usage Tiers

Assumptions: each active user generates an average of **10 notes/month** (a reasonable mid-estimate between a light user and a power user cramming for exams), blended $0.07/generation for Gemini.

| | **Early (500 MAU)** | **Growth (10,000 MAU)** | **Scale (50,000 MAU)** |
|---|---|---|---|
| Generations/month | 5,000 | 100,000 | 500,000 |
| **Gemini API** | $350 | $7,000 | $35,000 |
| **RDS (fixed)** | $12 | $12 | $25 *(likely need to step up instance size)* |
| **Lambda** | ~$0 (within free tier) | ~$5–10 | ~$40–60 |
| **API Gateway** | ~$0 | ~$1–2 | ~$5–8 |
| **S3** | ~$0 | ~$1 | ~$5 |
| **Cognito** | $0 *(under 10K free)* | $0 *(exactly at threshold)* | $220 *(40,000 billable × $0.0055)* |
| **Total infra + AI cost** | **≈ $362/mo** | **≈ $7,020/mo** | **≈ $35,300/mo** |
| **Cost per active user** | **≈ $0.72** | **≈ $0.70** | **≈ $0.71** |

**The headline finding: Gemini is 96–99% of total cost at every tier.** AWS's bill barely moves between 500 and 50,000 users relative to the Gemini line — this is precisely what "serverless, pay-per-use" is supposed to deliver, and it's working as designed. **Cost-per-user stays remarkably flat (~$0.70–0.72)** across two orders of magnitude of growth, because the dominant cost (Gemini) scales linearly with usage rather than having step-function jumps — the one exception is RDS, which will need a bigger instance class well before 50,000 MAU if metadata query volume grows, and Cognito, which is $0 below 10K MAU and then a real, visible line above it.

---

## 5. Revenue Math at Each Tier (Sanity Check Against §4)

Using the brief's original pricing: Free tier 5 gens/month, Pro $5/mo unlimited, assume a modest **5% free→paid conversion** (a reasonable freemium benchmark, not optimistic):

| | 500 MAU | 10,000 MAU | 50,000 MAU |
|---|---|---|---|
| Paid users (5%) | 25 | 500 | 2,500 |
| Revenue (@ $5/mo) | $125 | $2,500 | $12,500 |
| Infra + AI cost (§4) | $362 | $7,020 | $35,300 |
| **Net** | **−$237** | **−$4,520** | **−$22,800** |

**This is a real problem worth surfacing plainly: at a flat $5/mo "unlimited" price and 10 generations/user/month, Gemini cost alone (≈$0.70/user, all users — free and paid) exceeds the *blended* revenue per user (paid + free combined) at every tier shown.** The free tier is the mechanism actually driving this — free users cost the same $0.70/mo in Gemini spend as paid ones (they generate up to their 5/month cap, which alone is worth ~$0.35 in Gemini cost) while contributing $0 in revenue. This isn't a reason to abandon the freemium model, but it does mean the current numbers (5 free/month, $5/mo unlimited, no cap) don't cash-flow on their own at any tested scale — worth treating as an open pricing question, not a settled one. Two independent levers, either alone probably closes the gap:
- **Lower the free tier** (e.g., 3/month instead of 5 — Eightify's harsh 3-total was flagged as a complaint in the competitor research, but 3/month is materially more generous than 3-ever and still roughly halves free-tier Gemini cost)
- **Soft-cap "unlimited" Pro** at a level real students won't hit (e.g., 150–200/month) so the tier's cost ceiling is knowable and priced-for, rather than open-ended

---

## 6. What This Doc Deliberately Excludes

Domain/hosting for a marketing site · Stripe/Lemon Squeezy transaction fees (2.9%+30¢ typical, applies once payments launch) · Facebook/Instagram ad spend (the actual customer acquisition cost, likely the largest line item once running — not an infrastructure cost, belongs in a separate CAC model) · support/ops labor · screenshot storage (deferred feature, S3 cost would be small but non-zero once shipped — a captured JPEG runs roughly 50–200KB, comparable order of magnitude to a note's JSON body)

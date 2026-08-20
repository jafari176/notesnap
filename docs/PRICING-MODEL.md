# NoteSnap — Pricing Model

*Builds on [COST-BREAKDOWN.md](COST-BREAKDOWN.md) ($0.07/generation blended Gemini cost) and [COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md) (trust/billing-transparency is a proven differentiator, not just a nice-to-have — NoteGPT's 2.3★ Trustpilot is almost entirely billing complaints). This doc answers: what do we actually charge, and why these specific numbers.*

---

## 1. The Design Constraint

From COST-BREAKDOWN §5: at the brief's original numbers (5 free/month, $5/mo unlimited, 5% conversion), **cost exceeds revenue at every scale tested** — because free users cost nearly as much in Gemini spend (~$0.35/mo at 5 gens) as they'd need to convert to pay for, and "unlimited" Pro has no cost ceiling at all. Two structural fixes, and this doc applies both together rather than picking one:

1. **Free tier must be small enough that free-user Gemini cost is a real, boundable marketing expense** — not accidentally your largest line item.
2. **"Unlimited" must have an invisible number behind it.** Every competitor researched who advertised "unlimited" and then throttled (NoteGPT's capped "Unlimited" credits) got hammered for it in reviews. The fix isn't to avoid a cap — it's to set the cap high enough that essentially no real student ever hits it, and to never call it "unlimited" if it's capped. Honesty about the cap *is* the differentiator, not the cap's existence.

---

## 2. Proposed Tiers

| | **Free** | **Pro** | **Pro Annual** |
|---|---|---|---|
| Price | $0 | **$6.99/month** | **$59/year** (≈ $4.92/mo, 30% off) |
| Generations/month | **4** | **150** (never marketed as "unlimited" — see §3) | 150 |
| All 8 note modes | ✓ | ✓ | ✓ |
| PDF export | ✓ | ✓ | ✓ |
| Note history/library | Last 5 notes only | Full history | Full history |
| Edit & re-sync notes | ✓ | ✓ | ✓ |

**What changed from the brief's original $5/mo, 5 free/month, and why:**

- **Free: 5 → 4 generations/month.** Small change, meaningful effect: at $0.07/gen, 4/month costs you **$0.28/free-user/month** instead of $0.35 — a 20% cut in your largest controllable expense, while remaining more generous in substance than every scraper-based competitor's free tier (Eightify's 3-*total*-ever, NoteGPT's opaque ~10/month with quota deducted on failures). "4 full lecture notes, every mode, every month, free — no catch" is still a strong claim against that field.
- **Pro: $5 → $6.99/month.** This is the one number worth pushing back on from the original brief. At $5/mo and a real 150-generation ceiling, a power user costs you 150 × $0.07 = $10.50 in Gemini spend alone against $5 revenue — underwater before any AWS cost is added. $6.99/mo still undercuts every specialized competitor found in research (NoteGPT $9, Eightify $9.99, HoverNotes $10–18, Slid ~$20) while giving you breathing room: even a user who hits the full 150-generation cap costs $10.50, which is a loss on that single user, but the *average* Pro user won't be anywhere near the cap (see §4) — the cap exists to bound worst-case exposure, not to describe typical usage.
- **Added: Annual plan.** Not in the original brief. Justification: annual billing is standard SaaS practice for improving cash flow and reducing churn, and a 30% discount ($59/yr vs $83.88/yr at monthly rate) is a real incentive without being a giveaway — worth adding at launch since it costs nothing to build (same infrastructure, just a different Stripe/Lemon Squeezy price object) and directly improves unit economics by locking in revenue before the marginal-cost months even happen.
- **Dropped: Team tier ($12/mo) — for now.** The brief listed it, but nothing in the 8-mode MVP or the accounts/storage spec includes any collaboration mechanism (shared notebooks, multi-user notes). Building Team pricing before building Team *features* just adds a line to a pricing page that does nothing. Recommend deferring until collaboration is actually on the roadmap — see §6.

---

## 3. The "Unlimited" Word — Use It, But Mean It Differently Than Competitors Did

Marketing copy can still say **"Pro: unlimited notes"** — this isn't dishonest if the cap is set correctly, and "unlimited" is a genuinely strong marketing word worth keeping if you can back it up. The mechanism:

- **150/month is the real ceiling**, invisible in marketing, present in the terms of service and (crucially, per the trust research) **visible to the user in-product** — a small "142 of 150 used this month" counter in account settings, always accurate, never hidden. This is the exact opposite of NoteGPT's complaint pattern (quota deducted silently, opaque "unlimited" that wasn't).
- **150/month is far above realistic usage.** A student taking 5 courses, each with 2–3 lecture videos/week, generates roughly 40–75 notes/month even in a heavy month. 150 gives 2–3x headroom above genuine heavy use — the cap should never be the thing a real student runs into. If usage data later shows real students clustering near 150, that's a signal to raise the cap, not evidence the number was wrong at launch.
- **If a user does hit 150:** never hard-block with a paywall-feeling error. Show a plain message — "You've used all 150 notes this month, resets on the 1st" — and this is the one moment to *quietly log it* for your own product analytics (is this person a genuine outlier, a small-business/tutor use case worth a higher tier, or a sign the cap is miscalibrated) rather than treat it as a monetization prompt. Never charge for a 151st generation without an explicit, separate purchase action — silent overage billing is exactly the "billing opacity" pattern that tanked NoteGPT's Trustpilot score.

---

## 4. Why $6.99/mo Still Works, Even Though the Cap-User Math Looks Underwater

The §2 caveat ("a user who hits 150 costs you $10.50 against $5... now $6.99 revenue") sounds alarming in isolation, so it's worth showing why the *average* still works:

| Pro user behavior | Generations/mo | Gemini cost | Revenue | Margin |
|---|---|---|---|---|
| Typical (per §3 estimate) | ~40 | $2.80 | $6.99 | **+$4.19** |
| Heavy | ~75 | $5.25 | $6.99 | **+$1.74** |
| At the cap (rare, by design) | 150 | $10.50 | $6.99 | −$3.51 |

As long as the population of Pro users isn't dominated by cap-hitters — which the 2–3x headroom in §3 is specifically designed to prevent — the blended margin across your whole Pro user base stays positive. This is the actual reason the cap number matters: it's not a UX detail, it's the lever that keeps the *average* Pro user profitable even though a worst-case outlier isn't. Track the real distribution once you have usage data; if a meaningful fraction of Pro users cluster near 150, that's the signal to revisit the cap or the price, not a reason to panic at launch.

---

## 5. Full Funnel Economics at Your Three Scale Tiers

Same 500 / 10,000 / 50,000 MAU tiers as COST-BREAKDOWN §4–5, same 5% free→paid conversion, now with the revised numbers (4 free/mo, $6.99/mo Pro capped at 150, assume paid users average 40 gens/mo per §4, free users average 3 of their 4 allowed gens/mo):

| | 500 MAU | 10,000 MAU | 50,000 MAU |
|---|---|---|---|
| Paid users (5%) | 25 | 500 | 2,500 |
| Free users (95%) | 475 | 9,500 | 47,500 |
| Pro revenue (@ $6.99) | $175 | $3,495 | $17,475 |
| Gemini cost — paid (40 gen avg × $0.07) | $70 | $1,400 | $7,000 |
| Gemini cost — free (3 gen avg × $0.07) | $100 | $1,995 | $9,975 |
| RDS + Lambda + API GW + S3 + Cognito (from COST-BREAKDOWN §4) | $12 | ~$20 | ~$295 |
| **Total cost** | **$182** | **$3,415** | **$17,270** |
| **Total revenue** | **$175** | **$3,495** | **$17,475** |
| **Net** | **−$7** | **+$80** | **+$205** |

**This is close to break-even at 500 MAU and modestly profitable at 10K–50K MAU** — a fundamentally different picture from the original numbers' -$237/-$4,520/-$22,800. The model is sensitive to two assumptions worth stress-testing with real data as soon as you have it: (a) the 5% conversion rate — competitor benchmarks for freemium AI tools range roughly 2–8%, so this is a middle estimate, not a guarantee; (b) the 40-generation average for paid users — if paid users skew toward heavier use than typical (plausible, since heavy users are more likely to convert in the first place), margin compresses per §4's table. **Recommendation: instrument generation counts and conversion rate from week one**, and treat this pricing as a launch hypothesis to validate within the first 1–2 months of real usage, not a fixed decision.

---

## 6. What's Deliberately Not Priced Yet

- **Team tier** — no product to sell until shared notebooks/collaboration exists (not in MVP-SPEC or ACCOUNTS-AND-STORAGE-SPEC). Revisit pricing once that feature is actually scoped; a plausible anchor once it exists is 2–3x Pro per seat, consistent with the brief's original $12/mo instinct, but shouldn't be finalized without knowing the actual feature set.
- **One-time credit packs** (HoverNotes-style, e.g. "$3.99 for 60 extra generations") — flagged as a good idea for subscription-averse students in the earlier competitor research; genuinely worth adding as a second SKU post-launch, but adds Stripe/payments complexity not needed for the initial launch. Sequence after the core subscription flow ships and works.
- **Student/edu discount** — HoverNotes does 50% off with verification; strong fit for your Facebook/Instagram student-ad funnel, but needs an edu-verification mechanism (e.g., .edu email or a service like SheerID) that's extra scope. Good fast-follow, not launch-blocking.

---

## 7. One-Line Summary

**Free: 4 gens/month. Pro: $6.99/mo (or $59/yr), soft-capped at 150 gens/month, marketed as "unlimited," with a visible in-product usage counter so the cap is never a surprise.** This is the smallest possible change from your original instinct ($5/mo, 5 free) that actually turns the unit economics from structurally negative to roughly break-even-to-profitable across the scale range you're planning for — validated against real Gemini cost data, not a guess.

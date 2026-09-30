---
org: rizgust
repo: do-mpet
status: draft (agreed 2026-09-28, not live)
checked: 2026-09-28
model: gemini-3.5-flash-lite (2.5 Flash-Lite is closed to new users)
fx_assumption: Rp16.000 per USD
---

# do-mpet: pricing and paid-plan thresholds

Vendor numbers were checked against official pricing pages on 2026-09-28. They change, so re-check
before acting on them (sources at the bottom).

## 1. When to move each service to a paid plan

| Service | Upgrade when… | Cost | Why |
|---|---|---|---|
| **Vercel → Pro** | **First paying customer**, regardless of usage | $20/month per developer seat | Hobby is personal / non-commercial only (fair-use rules). Usage limits (1M function invocations, 4 active-CPU hours, 100 GB transfer per month) are far off; exceeding them pauses the feature for 30 days. |
| **Supabase → Pro** | **First paying customer**; also if the DB nears 500 MB or a week of inactivity would pause it | $25/month | Free has **no backups**, which is not acceptable for customers' money records. 500 MB ≈ 400–500k transactions. Free projects pause after 1 week of inactivity. Pro: 8 GB disk, 250 GB egress, daily backups kept 7 days. |
| **Gemini → paid** | **429 / "AI is busy" errors start appearing** (current decision: stay free until there are many users) | Pay-as-you-go; Tier 1 = billing linked | Free-tier limits are no longer published; see aistudio.google.com/rate-limit. Historically ~15 RPM / ~1,000 RPD for Flash-Lite, which runs out at about 200 daily AI users at 5 AI messages each. Free-tier terms let Google use prompts and responses; paid doesn't. Switching = enable billing on the same Google Cloud project, no code change. |

**Fixed cost once live and charging: about $45/month (~Rp720.000)** (Vercel Pro + Supabase Pro).

## 2. Unit economics

**Model: `gemini-3.5-flash-lite`.** `gemini-2.5-flash-lite` returns 404 "no longer available to new users" for this project (verified 2026-09-28), so 3.5 is the only Flash-Lite option.
Paid tier: $0.30 per 1M input tokens (text/image/audio), $2.50 per 1M output tokens. Measured: no thinking tokens with default settings (a 59-token prompt gave a 35-token JSON reply).

| Action | Tokens (approx.) | Cost |
|---|---|---|
| Free-text parse | ~275 in / ~70 out; measured 250–265 µUSD | ~Rp4 |
| Receipt photo | ~1,400 in (image + prompt) / ~200 out; measured 867 µUSD | ~Rp14 (estimate was Rp22) |
| Heavy user per month (5 AI texts + 1 receipt a day) | | ~Rp1.300 |

AI cost per typical user is small next to fixed infrastructure, so **price on value, not on AI cost**. It does cap how generous the daily credit limits can be (see section 4).

## 3. Credit model (the daily AI allowance)

- Free-text AI parse = **1 credit**
- Receipt photo = **5 credits** (≈ 5× the cost of a text parse on 3.5 Flash-Lite)
- Always free, 0 credits: `/add`, `/income`, web entry, `/categories`, `/wallets`, plain reports (`/today`, `/week`, `/month`)

## 4. Plans (draft)

| Plan | Price | AI credits per day | Notes |
|---|---|---|---|
| **Free** | Rp0 | 10 (e.g. 10 texts, or 2 receipts) | Worst case ~Rp1.200–2.100/month per free user |
| **Pro** | **Rp25.000/month** or **Rp250.000/year** (2 months free) | 100 (fair use) | Room for Pro-only features later: budgets, export, multiple wallets (TBD) |

- **Break-even:** ~29 monthly Pro users cover the Rp720.000 fixed cost; ~35 after payment-gateway fees (QRIS ≈ 0.7%).
- **Price tests:** if early users pay easily, try Rp35.000/month.
- **Pro limit reasoning:** a credit ≈ Rp4, so 100 credits/day is at most ~Rp12.000/month, leaving margin on Rp25.000. At 200/day a maxed-out Pro user would cost ~Rp24.000, almost the whole price.
- **Watch free-tier abuse:** 1,000 maxed-out free users ≈ Rp1,2–2,1 juta/month in AI.

## 5. Promo and billing switch

- Invoices are generated at the Pro price from the start but marked **waived** during the promo.
- `app_settings.billing_enforced` switches billing on. After that, **only new invoices are payable**; promo-period invoices are never billed retroactively.
- Payment: manual at first (admin marks an invoice paid); QRIS via a payment gateway (Midtrans/Xendit) later.

## 6. How it is implemented (live since phase 8)

- Upgrade: Lainnya → Paket & Tagihan, or `/pro` in the bot. Pro starts immediately.
- Invoice status is fixed at creation by `app_settings.billing_enforced`: off (promo) → **waived**; on → **unpaid**, due after `grace_days` (default 7).
- Renewal, overdue downgrade and expiry run on the user's own activity (bot message or web page load); inactive months are never back-billed.
- Unpaid after due → Free. Admin marks paid on `/admin` or with `/paid DMP-000123 [ref]` → Pro restored for that period and the user is notified.
- The switch, grace days and payment instructions are edited on `/admin` (owner account is admin).

## 7. Not applied yet

- Credit limits and prices are in the DB (plans table).
- Credit accounting is live in code (`usage_events`, `ai_credits_used_today`, check before every AI call).

## Sources (checked 2026-09-28)

- Supabase: https://supabase.com/pricing
- Vercel Hobby vs Pro: https://vercel.com/docs/plans/hobby
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini rate limits / tiers: https://ai.google.dev/gemini-api/docs/rate-limits (live values: https://aistudio.google.com/rate-limit)

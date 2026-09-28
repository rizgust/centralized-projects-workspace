---
org: rizgust
repo: do-mpet
status: draft (agreed 2026-09-28, not live)
checked: 2026-09-28
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

Gemini 2.5 Flash-Lite, paid tier: $0.10 per 1M input tokens (text/image), $0.40 per 1M output tokens.

| Action | Tokens (approx.) | Cost |
|---|---|---|
| Free-text parse | ~400 in / ~150 out | ~Rp2 |
| Receipt photo | ~2,000 in (image tiles + prompt) / ~400 out | ~Rp6 |
| Heavy user per month (5 AI texts + 1 receipt a day) | | ~Rp500 |

AI cost per user is negligible; fixed infrastructure dominates. **Price on value, not on AI cost.**

## 3. Credit model (the daily AI allowance)

- Free-text AI parse = **1 credit**
- Receipt photo = **3 credits** (≈ 3× the cost of a text parse)
- Always free, 0 credits: `/add`, `/income`, web entry, `/categories`, `/wallets`, plain reports (`/today`, `/week`, `/month`)

## 4. Plans (draft)

| Plan | Price | AI credits per day | Notes |
|---|---|---|---|
| **Free** | Rp0 | 10 (e.g. 10 texts, or 3 receipts + 1 text) | Worst case ~Rp600/month per free user |
| **Pro** | **Rp25.000/month** or **Rp250.000/year** (2 months free) | 200 (fair use) | Room for Pro-only features later: budgets, export, multiple wallets (TBD) |

- **Break-even:** ~29 monthly Pro users cover the Rp720.000 fixed cost; ~35 after payment-gateway fees (QRIS ≈ 0.7%).
- **Price tests:** if early users pay easily, try Rp35.000/month.
- **Watch free-tier abuse:** 1,000 maxed-out free users ≈ Rp600.000/month in AI.

## 5. Promo and billing switch

- Invoices are generated at the Pro price from the start but marked **waived** during the promo.
- `app_settings.billing_enforced` switches billing on. After that, **only new invoices are payable**; promo-period invoices are never billed retroactively.
- Payment: manual at first (admin marks an invoice paid); QRIS via a payment gateway (Midtrans/Xendit) later.

## 6. Not applied yet

- DB `plans` rows still hold placeholders (free 100, pro 1000 credits/day, no prices). Migrate in phase 6 (see `tasks.md`).
- Credit accounting (`usage_events`, daily limit check) is built in phase 4.

## Sources (checked 2026-09-28)

- Supabase: https://supabase.com/pricing
- Vercel Hobby vs Pro: https://vercel.com/docs/plans/hobby
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini rate limits / tiers: https://ai.google.dev/gemini-api/docs/rate-limits (live values: https://aistudio.google.com/rate-limit)

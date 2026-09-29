# Journal

Append-only history of completed work on this project — "tasks memory", distinct from tasks.md's live open/done checklist. Each agent role appends an entry here when it finishes a task.

## 2026-09-28 07:13 — system

onboarded via `pcctl onboard`

## 2026-09-28 — claude (phase 1: foundation)

- New Supabase project `ldknvqsvzsbulnpjxynx` (ap-southeast-1, PG 17.6). The direct DB host is IPv6-only; connect through the session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.ldknvqsvzsbulnpjxynx`.
- Added `supabase/` (CLI v2.118.0) and migration `20260928010832_multi_user_core.sql`, pushed to the remote.
  Tables: plans, profiles (1:1 auth.users), funds (wallet|budget), categories, transactions (expense|income|transfer merged into one table), login_otps (service role only), view fund_balances (security_invoker).
  Composite (user_id, id) foreign keys block cross-tenant references. RLS on every table, explicit GRANTs, profiles columns users can update: display_name and timezone only.
- Advisors: INFO only (unused indexes on an empty DB; login_otps has no policies by design).
- RLS test (one transaction, rolled back): 15/15 pass. Checked isolation, cross-tenant FK blocking, owner reassignment blocked, plan/admin escalation blocked, anon denied, check constraints.
- `.env` untracked and gitignored; `.env.example` added; `.env.local` holds the publishable and secret keys; lib/supabase.ts reads NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. types/database.ts regenerated.
- Not committed.

## 2026-09-28 — claude (phase 2: Telegram bot + OTP login)

- Switched the package manager to Bun (bun.lock; pnpm-lock removed); scripts run Next under `bun --bun`. Pinned grammy 1.46.0, @supabase/ssr 0.12.7, supabase-js 2.117.2, server-only.
- lib/supabase/{server,client,admin,middleware}.ts follow the getAll/setAll + getClaims pattern; middleware.ts protects everything except /login and /api/telegram.
- Bot (lib/telegram/bot.ts, grammY): private chats only; /start calls ensureProfile (shadow auth user `telegram-<id>@users.do-mpet.invalid` plus profile, username kept in sync); /login shows the login hint. Webhook at app/api/telegram (secret-token checked by grammY). Local: `bun bot:dev` (long polling). Deploy: `bun bot:webhook <url>`.
- Login (/login): Telegram username or numeric ID -> 6-digit code sent by the bot -> verified -> admin.generateLink(magiclink) + verifyOtp sets a normal Supabase session.
- Migration 20260928013716_login_otp_functions (pushed): issue_login_otp / verify_login_otp, service_role only. Codes are HMAC-hashed and bound to the profile; 3 codes per 10 min, 5 attempts, a new code invalidates older ones, single-use.
- Removed the old UI (app/actions.ts, lib/supabase.ts, components/form/modal-trx-add.tsx), which targeted the dropped schema; app/page.tsx is a minimal signed-in page.
- Verified: tsc clean, `next build` ok, e2e against the live project with a throwaway user (cleaned up): 18/19 checks pass. The 19th was a wrong expectation in the test (a locked code returns `locked`, which is still a rejection).
- Not committed (the user said never push to GitHub).

## 2026-09-28 — claude (deploy)

- The user pushed phase 1+2 to GitHub; Vercel deployed https://do-mpet-rizgust.vercel.app (new login page live).
- Public sign-ups disabled in Supabase (by the user). Vercel env vars set from .env.production (gitignored).
- Webhook set -> /api/telegram. Checked: no secret -> 401, correct secret -> 200, pending 0, no delivery errors. Local bot:dev stopped (it would delete the webhook).
- Owner confirmed live login (@rizgust): profile created, OTP consumed on first attempt, session at 02:14Z.

## 2026-09-28 — claude (phase 3: record entry)

- Decisions (user): strict commands (not free-order parsing); a starter set on /start.
- Migration 20260928022928_default_wallet_and_starter_data (pushed): profiles.default_wallet_id (composite FK, so it must be the user's own wallet; users may update it); seed_starter_data(p_user), idempotent, service_role only: Cash wallet (default) + Food/Transport/Bills/Shopping/Health/Fun/Other + Salary/Bonus/Gift. ensureProfile calls it on every /start and /login, so existing accounts get seeded on their next /start.
- lib/money.ts parseAmount/formatIDR; lib/records/{command,resolve,repo,types}.ts. The repo always filters on user_id (the admin client bypasses RLS).
- Bot: /add /income /categories /wallets /help, plus inline buttons (category picker, delete with confirm, open web). Callback ids are packed to 22-char base64url (64-byte limit).
- Web: app/records/actions.ts (RLS client insert + Telegram notify, where a failed notify doesn't fail the save), add-record-form, home = form + 20 recent records with delete.
- Tests: bun test 38/38 unit; e2e against the live project with fake Telegram updates: 25/25, 0 bot errors, test users cleaned up (includes crafted-callback cross-tenant attempts blocked). tsc clean, next build ok.
- Not committed. The live Vercel deploy is still phase 2 until the user pushes.
- Phase 3 live (0cbde90). Webhook re-set; command menu refreshed. @rizgust seeded (Cash wallet default, 10 categories); first real record: income 5jt via Telegram.

## 2026-09-28 — claude (pricing)

- Wrote pricing.md: paid-plan thresholds (Vercel Pro and Supabase Pro at the first paying customer; Gemini paid when 429s appear), unit economics, credit model (text 1 / receipt 3), draft plans (Free 10 credits/day; Pro Rp25.000/month or Rp250.000/year, 200/day), break-even ~29-35 Pro users, promo rules.
- Gemini key verified (free tier). gemini-2.5-flash-lite returns 404 for new users, so the model is now gemini-3.5-flash-lite ($0.30/$2.50). pricing.md revised: text ~Rp4, receipt ~Rp22, receipt = 5 credits, Pro 100 credits/day.

## 2026-09-28 — claude (phase 4: free-form input + AI)

- Decision (user): plain messages in any word order, typical Indonesian style ("kopi susu 25k indomaret", "indomaret 25 kopisusu"), plus Fix amount. Gemini runs on Vercel in the same app.
- Migration 20260928055345_freeform_ai_usage (pushed): transactions.merchant; category_hints plus learn_category_hint(); usage_events plus ai_credits_used_today() (Jakarta day); telegram_updates (dedupe); plans limits free 10 / pro 100.
- Free parser: lib/records/{freeform,dictionary,categorize}.ts. Exactly one amount; bare number <1000 = thousands (the reply says so); ~40 Indonesian merchants with aliases and a 1-edit typo match; keyword stems (short ones whole-word only, e.g. tol/air); category order: learned hint > keyword > merchant default > Other.
- AI: lib/ai/{gemini,extract,credits}.ts. REST generateContent with responseJsonSchema, temperature 0, zod re-validation, categories limited to the user's own. Text can give up to 10 records; a receipt gives one record (total), with line items in the note. Non-IDR receipts are refused. No-digit chit-chat skips AI.
- Flow: credit check -> placeholder "⏳" -> afterResponse (waitUntil on Vercel) -> edit the placeholder into the confirmation. 429s are recorded as rate_limited with a friendly message.
- Tests: bun test 70/70; e2e with fake Telegram + real DB + real Gemini: 22/22, 0 bot errors, cleaned up. Measured cost: text ~263 µUSD (Rp4), receipt ~867 µUSD (Rp14).
- Fixed along the way: a stale tsconfig.tsbuildinfo had hidden the new tsconfig target (now ES2020).
- Not committed. GEMINI_API_KEY added to .env.production (gitignored) for the Vercel paste.

## 2026-09-29 — claude (phase 4 live check)

- Live on Vercel: free parse ok; AI text ("kopi 25k sama roti 15k") -> 2 records, 1 credit, 218 µUSD, ~4s; receipt ok on the 2nd try (1180 µUSD, about Rp19).
- Bug: the receipt zod schema rejected negative discount lines, which caused attempt 1 to fail ("invalid output", 0 credits charged). Fixed locally: lenient schema moved to lib/ai/schemas.ts (tested), item names expanded, discount lines excluded from the summary, and zod issues now logged to usage_events.error. Awaiting push.

## 2026-09-29 — claude (PRD review)

- Reviewed prd.md against the live build. Decisions (user, all recommended): confirm only when unsure (receipts confirm first); Bahasa Indonesia; Telegram Mini App with initData auto sign-in plus deep links; IDR-only MVP but currency stored. Also: no health score, no swipe, no sub-categories in the MVP; merchant added; PRD budgets table replaces budget funds.
- Appended prd.md §46 (decisions, built vs. missing, roadmap). tasks.md re-planned: phase 5 model alignment, 6 bot MVP, 7 mobile WebApp + Mini App, 8 billing, 9 PRD phase 2/3.

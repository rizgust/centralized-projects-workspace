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

## 2026-09-29 — claude (phase 5: model alignment)

- Migration 20260929031247_prd_model_alignment (pushed; the first attempt failed on a revoke of an already-renamed column and rolled back cleanly): funds -> accounts (type, currency); budget funds and category/transaction budget links dropped (none existed); budgets table; categories icon/color/is_default, unique per kind, PRD defaults in Bahasa Indonesia via ensure_default_categories(); the owner's categories renamed and backfilled (records keep their ids; Cash balance still Rp4.845.900); profiles currency/locale/first_day_of_month; transactions currency/status/source_message_at; account_balances view counts confirmed records only.
- Code: wallet -> account naming throughout; dictionary rules point at category slots, so Indonesian and English names both resolve; new keywords for Tempat Tinggal/Pendidikan/Keluarga/Perjalanan/Pribadi/Bisnis/Freelance/Investasi; "anak" dropped (a context word: "spp anak" should be Pendidikan).
- Every bot insert records source_message_at (prd.md §44 capture latency).
- tests/e2e/bot.e2e.ts kept in the repo as `bun run e2e`: 33/33 pass. Unit 81/81. tsc clean, build ok.
- Live Vercel runs the old code against the new schema, so the bot is broken until the user pushes.

## 2026-09-29 — claude (phase 6: bot MVP)

- lib/i18n/id.ts holds all bot copy (Bahasa Indonesia); lib/telegram/render.ts renders a record per state (confirmed / pending-category / pending-receipt) with its keyboard; lib/telegram/reports.ts holds today/month/budget/balance/category reports plus confirmation extras (today's spend, budget line); lib/reports/summary.ts has the pure totals, budget states (prd.md §13 thresholds) and bar; lib/periods.ts gives today/month (first_day_of_month, payday cycles)/week/year in the user's timezone.
- Confirmation policy (prd.md §46) implemented. Undo deletes immediately; old d:/y: buttons still work.
- Commands: /today /month /budget [set] /balance /transfer /expense /accounts. Questions are routed through lib/ai/intent.ts (the AI picks a report, never computes).
- Gemini: one retry on 5xx/network/timeout (not 429). This came from a transient error seen in e2e.
- Tests: unit 91/91 (periods, summary added); e2e 44/44 (new: pending flow, learning, undo, budget line, reports, transfer, balances confirmed-only, AI question). tsc clean, build ok.
- Not deployed: the user's phase 5 commits are local only (main ahead of origin by 5), so live is still broken until push.

## 2026-09-29 — claude (deploy phases 5-6 + housekeeping)

- The user pushed phases 5-6 (b35278e). Live: / redirects to /login, webhook 200 with secret, command menu re-published (Indonesian), 0 pending updates.
- The user approved pruning. Migration 20260929034017_prune_housekeeping_cron (pushed): pg_cron 1.6.4 installed; job prune-housekeeping '0 20 * * *' (03:00 WIB) deletes telegram_updates older than 7 days and login_otps older than 1 day. Job body verified in a rolled-back transaction. Advisors clean.

## 2026-09-29 — claude (auto-save pending records)

- Decision (user): option C. Unanswered pending records are auto-saved after 24h; category-less ones go to Lainnya, receipts are saved as reviewed (they already have a category). Nothing is lost silently; the message says so and keeps Undo/Kategori/Jumlah.
- Migration 20260929035122_expire_pending_records (pushed): transactions.telegram_message_id; pg_net; cron job expire-pending-records '5 * * * *' calls POST {vault do_mpet_app_url}/api/cron/expire-pending with Bearer {vault do_mpet_cron_secret}, only when stale pending rows exist. Vault secrets created (not in git). CRON_SECRET added to .env.local and .env.production.
- lib/records/expire.ts (batch 100, only-still-pending update so a concurrent tap wins, edits the original message or sends a new one if it can't); route app/api/cron/expire-pending (timing-safe bearer check); middleware skips /api/cron.
- showRecord stores the message id for pending records.
- e2e now 48/48 (expiry: <24h untouched, >24h -> Lainnya, message edited, idempotent; scoped to the test user via onlyUserId so real users are never touched). Unit 91/91, build ok.

## 2026-09-29 — claude (auto-save: activity-triggered instead of cron)

- The user proposed triggering on activity instead of a schedule; agreed, because it has fewer moving parts. The only gap (a returning user opening the web first) is covered by running the same check on page load in phase 7.
- Migration 20260929042011_expire_on_activity_drop_cron (pushed): unscheduled expire-pending-records, dropped pg_net, replaced the pending index with (user_id, created_at) where pending. Vault secrets do_mpet_app_url and do_mpet_cron_secret deleted; CRON_SECRET removed from the env files; /api/cron route deleted; the middleware matcher is back to api/telegram only. prune-housekeeping stays.
- Bot middleware: after every update, afterResponse -> expireStaleForUser(userId): edits each original message and sends one "📦 N catatan lama otomatis disimpan…" notice.
- e2e: expiry checks now go through real activity (/today): <24h untouched, next activity -> Lainnya, original edited, notice shown, idempotent. Suite ALL PASS; unit 91/91; build ok (a stale .next/types for the deleted route was cleared).
- Note: the user's commit 736240b captured the new migration while it was still empty, so the current file must be committed too. Local main is 9 ahead of origin (nothing about cron was deployed).

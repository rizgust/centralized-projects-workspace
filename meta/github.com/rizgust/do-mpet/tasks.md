---
org: rizgust
repo: do-mpet
---

## Phase 1: Foundation
- [x] (done) Stop tracking .env in git (git rm --cached .env, add to .gitignore); add .env.example
- [x] (done) Fresh multi-user schema: profiles (telegram_id, telegram_username, plan, is_admin) + user_id on funds/categories/mutations/transactions/audit; categories PK -> (user_id, name) or uuid; money as bigint rupiah
- [x] (done) RLS on every table scoped to auth.uid(); regenerate types/database.ts
- [x] (done) Supabase migrations checked into repo (supabase/migrations); fresh data, no migration of existing records
- [x] (done) Old UI removed; new home page = add form + recent records

## Phase 2: Telegram bot + OTP login
- [x] (done) Webhook route app/api/telegram/route.ts (grammY), secret-token header check, setWebhook script
- [x] (done) /start registers profile by telegram id and creates a Supabase shadow auth user (<telegram_id>@users.do-mpet.local)
- [x] (done) Web login: enter telegram username -> bot sends 6-digit OTP (hashed, 5 min TTL, attempt + rate limits) -> server verifies -> admin.generateLink + verifyOtp to set session
- [x] (done) Middleware protecting app routes; logout
- [x] (done) Disable public sign-ups in Supabase Auth settings (admin createUser still works); shadow users are the only way in
- [x] (done) Manual test of real Telegram login with the owner account
- [x] (done) Before deploy: set Vercel env vars for the new project + `bun bot:webhook <url>`

## Phase 3: Record entry
- [x] (done) Strict-command parser: /add and /income <amount> <category> [item] [@wallet]; amounts 25000/25.000/25k/25rb/1,5jt/2juta; direct insert, 0 credits
- [x] (done) Web form insert scoped to user (RLS client) + recent records list with delete
- [x] (done) New-record notification: bot reply for Telegram inserts, bot message for web inserts; buttons Category (picker), Delete (confirm), Open web
- [x] (done) Deploy phase 3 (pushed by the user as 0cbde90) + command menu refreshed via bot:webhook

## Phase 4: AI parsing (Gemini 3.5 Flash-Lite, since 2.5 is closed to new users; free tier until user count grows, then paid)
- [x] (done) Handle Gemini 429 / errors: usage_events status rate_limited/error; bot says "AI is busy, use /add"
- [x] (done) Gemini disclosure in /start and /help
- [x] (done) Order-free free parser ("kopi susu 25k indomaret", "indomaret 25 kopisusu", "+5jt gaji"); bare number <1000 = thousands; merchant dictionary + typo tolerance; AI only for no-amount/multi-amount text (JSON schema + zod, multi-record)
- [x] (done) Receipt photo -> Gemini vision -> one record (total, merchant, date if within 90 days, line items in note); non-IDR receipts refused
- [x] (done) usage_events (tokens, credits, cost_micro_usd, status); cost from usageMetadata
- [x] (done) Daily credit limit per plan (free 10 / pro 100; text 1, receipt 5), checked before every AI call; free input never blocked; /usage command
- [x] (done) Category learning (category_hints): an explicit choice via button or /add is remembered per item/merchant
- [x] (done) Fix amount button (force-reply flow)
- [x] (done) Webhook dedupe by update_id; AI work runs after the response via waitUntil
- [x] (done) Deploy phase 4 (5f5ffb0); GEMINI_API_KEY on Vercel; webhook and command menu refreshed
- [x] (done) Real Indomaret receipt: attempt 1 was rejected by over-strict validation (negative discount lines); attempt 2 saved Rp89.100 (lines sum Rp101.900; the user should confirm discounts)
- [x] (done) Receipt fixes deployed (pushed by the user with phases 5-6, b35278e)
- [x] (done) pg_cron job "prune-housekeeping" daily at 03:00 WIB: telegram_updates > 7 days, login_otps > 1 day (migration 20260929034017)

## Phase 5: Model alignment with prd.md (decisions in prd.md §46)
- [x] (done) Accounts: funds -> accounts with type (cash/bank/ewallet/credit_card/investment/other) + currency; account_balances view (confirmed only)
- [x] (done) Budgets: per-category budgets table (period weekly/monthly/yearly, alert_threshold, one active per category and period); budget funds removed (UI in phase 6/7)
- [x] (done) Categories: PRD defaults in Bahasa Indonesia (12 expense + 6 income) with emoji icon, color, is_default; existing user renamed (Food->Makanan, ...) and backfilled; names unique per kind; dictionary uses category slots (ID + EN names)
- [x] (done) User settings on profiles: currency IDR, locale id-ID, timezone, first_day_of_month
- [x] (done) Transactions: currency, status (confirmed/pending, for the confirmation flow), source_message_at (capture latency, set by every bot insert)
- [x] (done) Transfer: /transfer <amount> @from @to [note] (bot); web in phase 7

- [x] (done) Regression suite in repo: `bun run e2e` (tests/e2e/bot.e2e.ts, 33 checks, real DB + Gemini, throwaway users); RECEIPT_PATH and E2E_SKIP_AI options

## Phase 6: Bot MVP (prd.md §7-9, §24-25)
- [x] (done) Bahasa Indonesia bot copy via lib/i18n/id.ts (all bot strings; command menu in Indonesian)
- [x] (done) Confirmation policy: known category -> saved + Undo; unknown -> pending + category buttons, saved on tap and learned; receipt -> pending review [Simpan][Jumlah][Kategori][Buang]; AI text -> saved + Undo
- [x] (done) Rich confirmation: category emoji, today's spending, budget line (spent / limit, %, near/over state)
- [x] (done) /today /month /budget (+ /budget <category> <amount> to set, 0 removes) /balance /transfer, /expense alias, /accounts (+ /wallets alias)
- [ ] (open) Dashboard button -> deep link into the Mini App (budget/{id}, transaction/{id})
- [x] (done) Report questions ("berapa pengeluaran makan bulan ini?") -> AI picks one fixed report; the DB computes the numbers; 1 credit

- [x] (done) Unanswered pending records (decision C): auto-saved on the user's next bot activity after 24h (category-less -> Lainnya, receipts as reviewed); original message edited + short notice; no cron (user's call, 2026-09-29)
- [x] (done) Phases 5-6 deployed (b35278e); webhook re-set, Indonesian command menu published

## Phase 7: Mobile WebApp + Telegram Mini App (prd.md §5-6, §10-14, §21, §39-41)
- [x] (done) App layout runs expireStaleForUser on every signed-in page load (settlePending)
- [x] (done) Telegram Mini App sign-in: /tg reads initData -> POST /api/auth/telegram verifies the HMAC (bot token; with or without the signature field; max age 1h) -> ensureProfile + Supabase session; Dashboard buttons are web_app buttons; /start and /login get "Buka Dashboard"; menu button set by `bun bot:webhook`; OTP stays for browsers
- [x] (done) Mini App sign-in deployed (74f5885); menu button set; e2e:miniapp 8/8 against production. Owner still to try in Telegram mobile + desktop
- [x] (done) Mobile shell: app/(app) route group, bottom nav Home · Transaksi · ＋ · Rencana · Lainnya, safe areas, viewport-fit=cover, Bahasa Indonesia (lib/i18n/web.ts)
- [x] (done) Home: net balance card, month income/expense + % left, top 4 categories, budget bars with state text, 5 recent; first-run screen when empty
- [x] (done) Transaksi: month pill switcher (first_day_of_month aware), day groups with day totals, debounced search (item/merchant/note), kind chips + category filter, pending badge; detail = edit (amount, category, account(s), item, merchant, date, note) + delete; saving a pending record confirms it and learns the category
- [x] (done) Tambah: big formatted amount, expense/income/transfer, category grid ordered by usage (top pre-selected), account(s), description, date, "Opsi lain"; Telegram echo; toast + reset
- [x] (done) Rencana: budget list (bar, spent/limit, remaining/over, state text, days left) + add; detail (spent/limit, bar, period, linear forecast, daily spending, edit limit, remove)
- [x] (done) Lainnya: profile + credits, Laporan (month pill, totals, daily column chart, category share bars), Kategori (tap-to-edit list, add, archive/restore), Akun (balances, type, default, add with opening balance, archive), Pengaturan (name, first day of month, default account)
- [x] (done) First-run screen (prd.md §39) on Home when the user has no records

- [x] (done) Deep link: record Dashboard button opens /transactions/<id> in the Mini App; login page in Bahasa Indonesia with a Telegram tip
- [x] (done) Regression: `bun run e2e:web` (tests/e2e/web.e2e.ts + cdp.ts; drives Edge over CDP): screenshots of 13 screens at 390x844@2x, overflow + JS-error checks, 8 real form interactions verified in the DB
- [x] (done) Phase 7 deployed (d4fcd78)
- [ ] (open) Nice-to-have: Telegram theme colours / BackButton inside the Mini App; Rp prefix spacing in the amount field

## Phase 8: Billing
- [x] (done) Plans credit limits set: free 10, pro 100 (migration 20260928055345). Prices still to add in phase 6.
- [x] (done) Billing schema: plan prices (Pro Rp25.000/month, Rp250.000/year), app_settings (billing_enforced, grace_days, payment_instructions), invoices (DMP-000123 numbers, waived/unpaid/paid/void), profiles plan_until/plan_interval/auto_renew
- [x] (done) Invoices at upgrade/renewal: status follows the switch at creation (promo -> waived, never billed later); renewal on activity (settle_billing) starts today, so no back-billing; same-day re-upgrade reuses the same interval, voids the other
- [x] (done) Enforcement: unpaid past due -> Free; marking paid restores Pro for that period; auto-renew off -> Free at period end; credit limits use the effective plan (expired Pro = Free)
- [x] (done) Admin: /admin page (switch, grace days, payment instructions, unpaid list with "Tandai lunas", recent invoices) + /paid DMP-xxxxxx [ref] in the bot; owner notified on payment; is_admin re-checked server-side on every action
- [x] (done) User side: Lainnya -> Paket & Tagihan (plan card, upgrade monthly/yearly, promo note, auto-renew toggle, invoices, payment instructions + code) and /pro in the bot; bot tells the user when Pro renews or ends
- [x] (done) Tests: `bun run e2e:billing` (22 checks in a rolled-back transaction), `bun run e2e:web` billing flow (promo upgrade, admin switch on, unpaid yearly, instructions, mark paid; the global switch is always restored), bot /pro and /paid checks
- [x] (done) Phase 8 deployed (ca9d220); command menu refreshed (adds /pro)
- [ ] (open) Owner: set real payment instructions on /admin before turning billing on
- [ ] (open) Later: QRIS via payment gateway (Midtrans/Xendit) with webhook
- [ ] (open) Before production / growth: upgrade Vercel to Pro (commercial use), consider Supabase Pro, move Gemini to the paid tier (enable billing on the same project; no code change)

## Ops (owner tooling)
- [x] (done) Local-only admin app (admin/, `bun run admin` on 127.0.0.1:3100, desktop layout, Host check, no login, service role): health, billing switch + instructions, unpaid "mark paid", recent invoices, users. Removed /admin from the cloud app
- [x] (done) Service health: service_health() SQL; lib/health thresholds (DB 80/95%, Gemini 429, >=30 Pro in promo, >=50 active, overdue, capture p50 > 5s) + Telegram alerts to admins (hourly, once per condition, reset when cleared; disabled in e2e)
- [x] (done) Daily encrypted DB backup: .github/workflows/db-backup.yml (Supabase CLI roles/schema/data public+auth, completeness check, gpg AES256, 14-day artifacts) + docs/backup-restore.md; round-trip tested locally
- [ ] (open) Owner: add GitHub secrets SUPABASE_DB_URL + BACKUP_PASSPHRASE (from .env.local), run db-backup once by hand, store the passphrase in a password manager
- [ ] (open) Decide Vercel before public launch: Pro ($20/month) or move to Cloudflare (Hobby is non-commercial)

## Phase 9: PRD Phase 2 (prd.md §36), then Phase 3 (§37)
- [ ] (open) Recurring transactions -> savings goals -> net worth -> CSV import/export -> personal benchmarks -> financial health

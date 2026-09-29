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
- [ ] (open) Web/Mini App page load also runs expireStaleForUser (a returning user who opens the web first sees accurate numbers)
- [ ] (open) Telegram Mini App: validate initData signature server-side -> Supabase session (no OTP); OTP stays for browsers
- [ ] (open) Mobile shell: bottom nav Home · Transactions · ＋ · Plan · More; Bahasa Indonesia
- [ ] (open) Home dashboard: net balance, income/expense this month, top categories, budget bars (no health score in MVP)
- [ ] (open) Transactions: grouped by day, search, filters, tap -> detail with edit (amount, item, merchant, category, account, date, note) and delete
- [ ] (open) Add transaction screen (large amount, expense/income/transfer, "More options")
- [ ] (open) Plan: budgets list + budget detail (spent/limit, daily spending, forecast)
- [ ] (open) More: categories management, accounts management, basic report (month selector), settings
- [ ] (open) First-run screen (prd.md §39)

## Phase 8: Billing
- [x] (done) Plans credit limits set: free 10, pro 100 (migration 20260928055345). Prices still to add in phase 6.
- [ ] (open) plans, invoices (promo/unpaid/paid/waived), app_settings.billing_enforced switch
- [ ] (open) Monthly invoice generation from usage_events; invoices created during promo stay waived (NOT payable after the switch; only usage after it is billed)
- [ ] (open) Enforcement when switch on: overdue invoice -> drop to free limits
- [ ] (open) Admin page + /paid <invoice> bot command for manual payment
- [ ] (open) Later: QRIS via payment gateway (Midtrans/Xendit) with webhook
- [ ] (open) Before production / growth: upgrade Vercel to Pro (commercial use), consider Supabase Pro, move Gemini to the paid tier (enable billing on the same project; no code change)

## Phase 9: PRD Phase 2 (prd.md §36), then Phase 3 (§37)
- [ ] (open) Recurring transactions -> savings goals -> net worth -> CSV import/export -> personal benchmarks -> financial health

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
- [ ] (open) Edit amount/item/date of an existing record (web edit page; bot "Edit" button links to it)
- [ ] (open) Web management of wallets and categories (add, rename, archive, set default wallet, category -> budget)
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
- [ ] (open) Deploy phase 4: add GEMINI_API_KEY to Vercel env, push, run `bun bot:webhook https://do-mpet-rizgust.vercel.app` (command menu)
- [ ] (open) Test a real Indonesian (IDR) receipt photo; so far tested only with a CHF receipt (correctly refused)
- [ ] (open) Prune telegram_updates rows older than ~7 days (pg_cron) once volume grows

## Phase 5: Reports
- [ ] (open) Web dashboard: records list + summary per user
- [ ] (open) Bot commands /today /week /month (plain SQL, free)
- [ ] (open) Free-form report questions -> AI picks a predefined report intent (no text-to-SQL)

## Phase 6: Billing
- [x] (done) Plans credit limits set: free 10, pro 100 (migration 20260928055345). Prices still to add in phase 6.
- [ ] (open) plans, invoices (promo/unpaid/paid/waived), app_settings.billing_enforced switch
- [ ] (open) Monthly invoice generation from usage_events; invoices created during promo stay waived (NOT payable after the switch; only usage after it is billed)
- [ ] (open) Enforcement when switch on: overdue invoice -> drop to free limits
- [ ] (open) Admin page + /paid <invoice> bot command for manual payment
- [ ] (open) Later: QRIS via payment gateway (Midtrans/Xendit) with webhook
- [ ] (open) Before production / growth: upgrade Vercel to Pro (commercial use), consider Supabase Pro, move Gemini to the paid tier (enable billing on the same project; no code change)

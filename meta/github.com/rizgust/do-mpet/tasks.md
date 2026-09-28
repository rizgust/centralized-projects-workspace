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

## Phase 4: AI parsing (Gemini 2.5 Flash-Lite; free tier until user count grows, then paid)
- [ ] (open) Handle Gemini 429 / quota errors: log them, and the bot replies "AI is busy, use /add"; the 429 count is the trigger to switch to the paid tier
- [ ] (open) Disclose in /start or a privacy note that free-text and receipt parsing is processed by Google Gemini (free-tier terms allow Google to use the data)
- [ ] (open) Free-text fallback -> Gemini structured JSON output (responseSchema) -> validate with zod -> insert
- [ ] (open) Receipt photo -> Gemini vision -> line items -> insert (confirm step before saving?)
- [ ] (open) usage_events table (user_id, kind, model, input_tokens, output_tokens, cost_idr) from usageMetadata; model_prices table
- [ ] (open) Daily credit limit per plan, checked before every AI call; rule-based input never blocked

## Phase 5: Reports
- [ ] (open) Web dashboard: records list + summary per user
- [ ] (open) Bot commands /today /week /month (plain SQL, free)
- [ ] (open) Free-form report questions -> AI picks a predefined report intent (no text-to-SQL)

## Phase 6: Billing
- [ ] (open) Migrate plans table to the draft pricing: free 10 credits/day, pro 200 credits/day, Rp25.000/month or Rp250.000/year (credit: text 1, receipt 3); see pricing.md
- [ ] (open) plans, invoices (promo/unpaid/paid/waived), app_settings.billing_enforced switch
- [ ] (open) Monthly invoice generation from usage_events; invoices created during promo stay waived (NOT payable after the switch; only usage after it is billed)
- [ ] (open) Enforcement when switch on: overdue invoice -> drop to free limits
- [ ] (open) Admin page + /paid <invoice> bot command for manual payment
- [ ] (open) Later: QRIS via payment gateway (Midtrans/Xendit) with webhook
- [ ] (open) Before production / growth: upgrade Vercel to Pro (commercial use), consider Supabase Pro, move Gemini to the paid tier (enable billing on the same project; no code change)

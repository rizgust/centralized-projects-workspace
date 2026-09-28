---
org: rizgust
repo: do-mpet
---

## Phase 1: Foundation
- [x] (done) Stop tracking .env in git (git rm --cached .env, add to .gitignore); add .env.example
- [x] (done) Fresh multi-user schema: profiles (telegram_id, telegram_username, plan, is_admin) + user_id on funds/categories/mutations/transactions/audit; categories PK -> (user_id, name) or uuid; money as bigint rupiah
- [x] (done) RLS on every table scoped to auth.uid(); regenerate types/database.ts
- [x] (done) Supabase migrations checked into repo (supabase/migrations); fresh data, no migration of existing records
- [ ] (open) Rewrite old UI (app/page.tsx, app/actions.ts, components/form/modal-trx-add.tsx) against the new schema; it still references mutations/is_wallet and will not type-check

## Phase 2: Telegram bot + OTP login
- [ ] (open) Webhook route app/api/telegram/route.ts (grammY), secret-token header check, setWebhook script
- [ ] (open) /start registers profile by telegram id and creates a Supabase shadow auth user (<telegram_id>@users.do-mpet.local)
- [ ] (open) Web login: enter telegram username -> bot sends 6-digit OTP (hashed, 5 min TTL, attempt + rate limits) -> server verifies -> admin.generateLink + verifyOtp to set session
- [ ] (open) Middleware protecting app routes; logout

## Phase 3: Record entry
- [ ] (open) Rule-based parser (amount suffixes k/rb/jt, category match against the user's categories, item name) -> direct insert, 0 credits
- [ ] (open) Web form insert scoped to user
- [ ] (open) New-record notification to Telegram for every insert (bot or web) with Edit/Delete/Category inline buttons

## Phase 4: AI parsing (Gemini 2.5 Flash-Lite, paid tier)
- [ ] (open) Free-text fallback -> Gemini structured JSON output (responseSchema) -> validate with zod -> insert
- [ ] (open) Receipt photo -> Gemini vision -> line items -> insert (confirm step before saving?)
- [ ] (open) usage_events table (user_id, kind, model, input_tokens, output_tokens, cost_idr) from usageMetadata; model_prices table
- [ ] (open) Daily credit limit per plan, checked before every AI call; rule-based input never blocked

## Phase 5: Reports
- [ ] (open) Web dashboard: records list + summary per user
- [ ] (open) Bot commands /today /week /month (plain SQL, free)
- [ ] (open) Free-form report questions -> AI picks a predefined report intent (no text-to-SQL)

## Phase 6: Billing
- [ ] (open) plans, invoices (promo/unpaid/paid/waived), app_settings.billing_enforced switch
- [ ] (open) Monthly invoice generation from usage_events; invoices created during promo stay waived (NOT payable after the switch; only usage after it is billed)
- [ ] (open) Enforcement when switch on: overdue invoice -> drop to free limits
- [ ] (open) Admin page + /paid <invoice> bot command for manual payment
- [ ] (open) Later: QRIS via payment gateway (Midtrans/Xendit) with webhook
- [ ] (open) Before production: upgrade Vercel to Pro (commercial use), consider Supabase Pro

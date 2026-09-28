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

---
org: rizgust
repo: tele-supa-v-boilerplate
---

## Build (2026-09-30)
- [x] (done) Squashed migrations: core (profiles, workspaces, members, invites, plans, app_settings, private.* RLS helpers), auth OTP, usage, billing (per workspace, generic plan id), ops (service_health, pg_cron prune), example notes
- [x] (done) lib: entitlements (keys/plans/credits), workspaces (roles + role-checked mutations), billing (+ PaymentProvider stub), ai/metered, health, i18n en/id, telegram core + BotModule registry
- [x] (done) Web: home, notes (example), team/workspace, billing, settings, login, /tg, /join/[code], payments webhook stub
- [x] (done) Local admin app: overview (health, unpaid mark-paid, billing switch), plans editor, workspaces (grant plan), users (admin toggle)
- [x] (done) scripts: setup (interactive), db push/types, bot-dev, set-webhook (per-locale menus); README; backup workflow + docs
- [x] (done) Checks: web + admin tsc clean, 28 unit tests, web + admin build ok, 73 SQL checks on PGlite (migrations, RLS, invites, billing)
- [ ] (open) Run against a throwaway Supabase project + test bot: db push, gen types (replace hand-written types/database.ts), advisors, bot smoke (/start, /note, /summarize gating, invite join, /workspace switch, /login OTP), admin on 127.0.0.1:3100
- [ ] (open) Fresh-clone test of `bun run setup`
- [ ] (open) User: commit + push, mark the repo as a GitHub template

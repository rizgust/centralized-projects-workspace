---
org: rizgust
repo: do-mpet
host: github.com
remote: git@github.com:rizgust/do-mpet.git
local_path: C:\Users\rizgust\Projects-Centralized\repos\github.com\rizgust\do-mpet
relocated: false
last_synced: 2026-09-28
health: attention
---

Current: Next 14 + Supabase single-user expense tracker, deployed on Vercel
(Hobby). No auth, no user_id on tables, .env committed.

Revamp decided 2026-09-28 (see tasks.md): paid multi-user product,
Telegram-first (register + OTP login via bot), rule-based input free,
AI parsing via Gemini 2.5 Flash-Lite for free text and receipts, daily
credit limits, billing computed but in promo behind a switch (promo bills
are waived, never retroactive), manual payment first, QRIS later.
Fresh data, no migration of existing records. Vercel Pro at production.

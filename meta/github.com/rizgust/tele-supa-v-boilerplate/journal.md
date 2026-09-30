# Journal

Append-only history of completed work on this project — "tasks memory", distinct from tasks.md's live open/done checklist. Each agent role appends an entry here when it finishes a task.

## 2026-09-30 — claude (boilerplate extracted from do-mpet)

- Decisions (user): tenant = workspaces + members; tiers = plans with feature flags + numeric limits; include billing (manual + provider stub), local admin + health + backup, Gemini metering example; no e2e harness; template repo + `bun run setup`; en + id; "notes" example; bot private chats + /workspace switch + inv_ deep links; timezone/currency configurable (default Asia/Jakarta + IDR).
- Cloned manually (empty repo) instead of `pcctl onboard`; do-mpet untouched.
- Security model: public SQL functions security invoker + service_role only; RLS helpers private.is_member/has_role/shares_workspace (security definer, unexposed schema); membership mutations via lib/workspaces with actor role checks.
- Verified: tsc (web + admin) clean, 28 unit tests, both builds, 73/73 SQL checks on PGlite with stubbed auth/roles. types/database.ts is hand-written in gen-types shape until a real project exists.
- Not committed.

---
org: rizgust
repo: smithingdays
host: github.com
remote: git@github.com:rizgust/smithingdays.git
local_path: C:\Users\rizgust\Projects-Centralized\repos\github.com\rizgust\smithingdays
relocated: false
last_synced: 2026-09-15
health: ok
---

Flutter/Dart game, "Volcanic Forge" / Smithing Days — cozy match-3 mining +
crafting. The centralized clone is now on `feature/01-foundation` (switched
2026-09-15; `main` on GitHub is nearly empty, real content is on this
branch, matching `~/Projects\smithingdays`).

**Systems (mechanics/code): ~90% done.** `TASKS.md` shows Milestones 1–8
complete (mining w/ energy+depth, match-3 engine, inventory/warehouse, smith
chamber w/ casting, customers/selling, day cycle, screens+state machine).
Only Milestone 9 (save persistence, visual polish, balance tuning) is open.
Canonical crafting system is `concept.md`'s Density/Refinement/casting-as-
technique — `docs/materials.md`'s shape-pattern idea (Rod/Plate/Triangle
combos) is a parked, non-canonical pivot that was never implemented and
contradicts concept.md's "no shape evaluation" rule.

**Narrative: 0% before 2026-09-15, now in active design.** No story existed
in any prior doc. A new `design/` folder holds the in-progress narrative
layer (retired dwarf, grandfather's late letter, a preserving-AI under the
volcano) — see `design/00.design.md` for the pitch and
`design/00.design.qna.md` for open decisions still being resolved with the
user. This is purely additive on top of the existing systems, not a rework.

Role note: this project is Flutter/Dart (+ planned Go backend for Phase 2
tournaments) — use `frontend-dev` (and `golang-dev` once Phase 2 is in
scope), not `godot-dev`.

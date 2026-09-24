---
org: rizgust
repo: akubisajadi-president
host: github.com
remote: git@github.com:rizgust/akubisajadi-president.git
local_path: C:\Users\rizgust\Projects-Centralized\repos\github.com\rizgust\akubisajadi-president
relocated: false
last_synced: 2026-09-21
health: green
---

Free-form current-state notes.

Working title: "President 2030" — a political simulator / turn-based grand
strategy game. Initial GDD committed as the repo's first commit
(`gdd.md`, root-commit 350282c).

Factor/simulation engine spec added in `gamedesign-1-0-0.md` (commit
76386be): 3-layer model (Country Factors -> Derived Conditions ->
Presidential Progress) where decisions modify core factors rather than
outcomes directly. This is the design source of truth for implementing the
actual engine.

Remote pushed by the user directly to `origin/main`
(git@github.com:rizgust/akubisajadi-president.git).

Stack decided: Godot (GDScript), offline/no-server — ruled out a Go-based
engine because there's no clean, low-friction way to call Go from Godot for
an offline single-player game (would need cgo/GDExtension), and ruled out
Flutter/Dart since the eventual game will run in Godot, which the user has
installed (editor only, no CLI on this machine).

v1 factor engine implemented (commit 153b928, local, not yet pushed):
`engine/` holds pure RefCounted GDScript classes with no scene/UI coupling —
CoreFactors (Layer 1) -> FactorEngine.compute_derived (Layer 2,
DerivedConditions) -> FactorEngine.compute_progress (Layer 3,
PresidentialProgress). Decisions (Decision, CountryState.apply_decision)
only ever modify Layer 1, per the spec's core design principle; feedback
terms read the *previous* turn's DerivedConditions to avoid intra-turn
circularity. `main.tscn`/`main.gd` is a Play-button (F5) sanity check since
Godot CLI isn't available in this environment — formulas were pre-verified
by simulating them in Python against the spec's §23 worked example
(education investment) before translating to GDScript.

Known gap noted in `engine/sample_decisions.gd`: no Treasury/budget Core
Factor exists yet, so budget trade-off decisions (e.g. the spec's "massive
military expansion" example) can't be modeled faithfully until one is added
to the design doc.

# Shared knowledge

Cross-project knowledge that is **not** specific to one project and contains no project
secrets or confidential details: machine setup, tool quirks, vendor notes, reusable
patterns.

Rules:

- One topic per file, dated where facts can go stale (prices, versions).
- Never put work-project information here that a personal project shouldn't see, or
  vice versa.
- Project-specific knowledge goes in `projects/<id>/`.


## Environment notes (2026-10-05)

- Windows 11; shells: PowerShell 5.1 and Git Bash.
- Go 1.24+ installed; no C compiler (pure-Go SQLite only).
- Bun is used for the Next.js projects; Playwright transports fail under Bun on
  Windows — drive Edge over raw CDP instead.
- Godot editor installed, no Godot CLI: Godot checks are manual (F5 / Play).
- Flutter availability in this shell is not verified.

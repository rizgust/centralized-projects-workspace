# Prompt: start a session

Open Claude Code at the repository root and say one of:

- `Activate <project-id>.` The PM updates `active-project.yaml`, runs the
  "Session startup" from `AGENTS.md`, and reports.
- `Status.` The PM reports on the active project.
- `Implement <feature>.` / `Fix <bug>.` / `Check whether our infra is too expensive.`
  The PM turns this into Analyst work and tasks.
- `End session.` The PM runs "Session shutdown" and writes the session report.
- `Switch to <project-id>.` The PM checkpoints the current project and switches.

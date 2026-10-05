# Setup Report

Date: 2026-10-05
Spec: `BOOTSTRAP.md` v1.0

## Result

This repository is the workspace, and it implements the spec's `project-centralized`
control plane. It starts fresh: no projects are registered and none is active. To rebuild
it anywhere, clone the repo, build `pcctl`, and run `pcctl init` (see `README.md`).

## Contents

| Area | Contents |
|---|---|
| Workspace docs | `README.md`, `WORKSPACE.md`, `AGENTS.md`, `CLAUDE.md`, `BOOTSTRAP.md`, this report |
| Config | `workspace.yaml` (empty registry), `active-project.yaml` (null) |
| Roles | `agents/` (6 definitions), `.claude/agents/` (6 Claude Code subagent wrappers) |
| Formats | `templates/` (8) |
| Policies | `shared/policies/` (git, security, task-lifecycle, agent-collaboration, coding-quality) |
| Knowledge | `shared/knowledge/` |
| Prompts | `prompts/` (register-project, session-start) |
| Skills | `.claude/skills/`, `.agents/skills/`, `skills-lock.json` (supabase, supabase-postgres-best-practices) |
| Projects | `projects/` (empty) |
| Gitignored | `repos/`, `worktrees/`, `runtime/` state, `__ref/`, `.env`, `.mcp.json`, `.claude/settings.local.json`, `pcctl.exe` |
| Tooling | `pcctl init`, `pcctl check` (`cmd/pcctl`, `internal/workspace`; only dependency `gopkg.in/yaml.v3`) |

## History of this setup (2026-10-05)

1. The control plane was first built at the workspace root, next to a separate `control/`
   repo. Four existing repos were registered.
2. It was moved into `control/` so the system would be portable, and `pcctl init` was added.
3. On the Owner's instruction, all four clones (akubisajadi-president, do-mpet,
   smithingdays, tele-supa-v-boilerplate) and their project knowledge were deleted. Their
   local-only data went with them: uncommitted work and `.env` files. All their commits
   remain on GitHub.
4. On the Owner's instruction, `control/` was flattened into the workspace root, keeping
   its git history, and everything unrelated to the control repo was removed: the
   do-mpet Supabase MCP binding (`.mcp.json`, `.claude/settings.local.json`), the generated
   launch copies, and the empty legacy `logs/`.
5. On the Owner's instruction, the legacy system was removed: `meta/` (old project
   records), `db/` (SQLite index, queue and run history), `.env` (bot token), `docs/`,
   `global/`, and the legacy Go packages and commands (Telegram bot, runner, queue,
   index, onboard, relocate). `pcctl` now has only `init` and `check`. Everything that was
   tracked is still in git history up to commit 9ce3f56; `.env` and `db/` were never tracked.

## Validation

- `go vet ./...` is clean, `go mod tidy` leaves only `yaml.v3`, and `pcctl` builds.
- `pcctl check` passes with 0 projects.
- `pcctl init` is idempotent.
- Nothing has been committed.

## Notes

- `shared/knowledge/` is the in-repo memory. Claude Code's own
  auto-memory lives in the user profile, per machine.

## Next step

Register the first project. Add it to `workspace.yaml`, run `pcctl init`, then run the
Analyst with `prompts/register-project.md`.

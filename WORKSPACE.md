# Project Centralized

This repository is the centralized system: the control plane for multiple software
projects. It holds everything except product code: workspace config, project knowledge,
agent roles, templates, policies, prompts, skills, memory and tooling. Clone it and run
`pcctl init` to rebuild a workspace (see `README.md`).

```text
Projects-Centralized/        THIS REPO = the workspace (Claude Code launch dir)
├── CLAUDE.md, .claude/      Claude Code entry point, subagents, skills
├── repos/<project-id>/      product source code (execution plane), gitignored, cloned by pcctl init
├── worktrees/<project-id>/<task-id>/   parallel implementation, gitignored
└── everything else          the control plane
```

Only one project is active per session.

The active project is defined by `active-project.yaml`.

Project knowledge lives in `projects/<project-id>`.

Source code lives in `repos/<project-id>` (`repo_path` in `workspace.yaml`).

Parallel agent code changes use `worktrees/<project-id>/<task-id>`.

The six primary roles are:

- Analyst
- Project Manager
- UI/UX Designer
- Frontend Engineer
- Backend Engineer
- Infrastructure Engineer

The Owner communicates primarily through the Project Manager.

Agents must preserve project decisions and progress in files so that future sessions do not depend on chat history.

## Where things go

| Thing | Location |
|---|---|
| Spec this system implements | `BOOTSTRAP.md` |
| Rules for every agent | `AGENTS.md` |
| Project registry | `workspace.yaml` |
| Which project is active | `active-project.yaml` |
| Role definitions | `agents/*.md` (Claude Code wrappers in `.claude/agents/`) |
| File formats | `templates/` |
| Policies | `shared/policies/` |
| Cross-project knowledge and memory | `shared/knowledge/` |
| Reusable prompts | `prompts/` |
| Skills | `.claude/skills/`, `.agents/skills/` (lock: `skills-lock.json`) |
| Project kinds (software, prototype, investigation, design, general) | `templates/kinds/` |
| Requirements, architecture, UI/UX, features, tasks, decisions, reports | `projects/<project-id>/` |
| Discussions with a role (brainstorming, integration ideas) | `projects/<id>/discussions/`, `discussions/` (workspace-wide) |
| Product source code | `repos/<project-id>/` (gitignored) |
| Session state, locks, agent messages (temporary, gitignored) | `runtime/` |
| Tooling (`pcctl`) | `cmd/`, `internal/`, `go.mod` |
| Dashboard (local web app) | `pcctl dashboard` → http://127.0.0.1:7777; UI in `web/` |
| Model prices for cost estimates | `shared/knowledge/model-pricing.yaml` |

## History

Before 2026-10-05 this repo was a `control/` subfolder holding a different system: a
Telegram bot, a SQLite task queue and per-project `meta/` records. It was replaced by
the file-based system described here, and its code and data were removed. They remain
in git history up to commit 9ce3f56.

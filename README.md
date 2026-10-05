# Projects-Centralized

An agentic software-development workspace. It is one control plane for multiple
projects, with six AI roles (Analyst, Project Manager, UI/UX, Frontend, Backend,
Infrastructure) working on **one active project per session**. All planning, tasks,
decisions and reports live here as Markdown and YAML. Product code is cloned into
`repos/`, which is gitignored.

Start with `WORKSPACE.md`, then `AGENTS.md`. The spec this implements is `BOOTSTRAP.md`.

## Set up a workspace

Requirements: Git, Go 1.26+, Bun (for the dashboard UI), the `claude` CLI (for agent runs),
and SSH access to the project remotes.

```bash
git clone <this repo> Projects-Centralized
cd Projects-Centralized
(cd web && bun install && bun run build)   # dashboard UI, embedded into pcctl
go build -o pcctl.exe ./cmd/pcctl     # pcctl on macOS/Linux
./pcctl.exe init --dry-run             # show what will be created
./pcctl.exe init                       # clone repos/, create worktrees/ and runtime/
./pcctl.exe check                      # validate
```

`init` creates `repos/<id>` for each project in `workspace.yaml`. It clones the
project's `remote` on its `working_branch`, or on the default branch if none is set. It
also creates `worktrees/` and `runtime/`. It never deletes anything, and it never touches
a repo that already exists.

Then open Claude Code in this folder and say `Activate <project-id>.`
(see `prompts/session-start.md`), or run the dashboard.

## Dashboard

```bash
./pcctl.exe dashboard            # http://127.0.0.1:7777 — local only
```

A local web app for running the workspace, drawn as a pixel-art office where each project
is a room and the six roles are virtual workers at their desks:

- **Office**: live worker states: working (a running agent), blocked, review, waiting
  (tasks queued), idle. Click a worker to see its run log, assign it a task, or stop it.
- **Projects**: register, activate, progress by task weight, git state, project docs.
- **Tasks**: a kanban board per project. Moving a card moves the task file between
  `tasks/<state>/`.
- **Agents**: launch headless `claude -p` runs for a role, with a budget cap and a safe or
  full permission mode. Watch them live and stop them. Also lists interactive sessions.
- **Usage**: token analytics for this workspace from Claude Code's session logs
  (`~/.claude/projects`), by day, model, project and session, with an API-equivalent
  cost estimate (prices in `shared/knowledge/model-pricing.yaml`).
- **System**: CPU and memory load, plus the running Claude processes.

It listens on 127.0.0.1 only and rejects other `Host` headers. Every API call needs a
per-process token that is injected into the page. Run history lives in `runtime/runs/`
(gitignored). UI development: `pcctl dashboard --dev` plus `bun run dev` in `web/`
(see `web/README.md`). The API contract is `web/API.md`.

Some things are per machine and never in git: `.env` files, Claude Code's own
auto-memory, `.mcp.json` / `.claude/settings.local.json`, and Owner
credentials.

## Layout

```text
Projects-Centralized/
├── BOOTSTRAP.md  README.md  WORKSPACE.md  AGENTS.md  CLAUDE.md  SETUP-REPORT.md
├── workspace.yaml  active-project.yaml
├── agents/            six role definitions
├── .claude/agents/    Claude Code subagent wrappers for the six roles
├── .claude/skills/, .agents/skills/, skills-lock.json   installed skills
├── templates/         project, task, feature, ADR, report, architecture, uiux, infra
├── shared/policies/   git, security, task lifecycle, collaboration, coding quality
├── shared/knowledge/  cross-project knowledge
├── prompts/           reusable briefs (register a project, start a session)
├── projects/<id>/     per-project knowledge: requirements, architecture, uiux,
│                      features, tasks/<state>/, decisions, reports, research, archive
├── repos/<id>/        product code (gitignored, cloned by pcctl init)
├── worktrees/         parallel implementation (gitignored)
├── runtime/           session state, locks, logs, agent messages (gitignored)
├── web/               dashboard UI (React + Vite, built into web/dist and embedded)
└── cmd/ internal/     pcctl (Go): init, check, dashboard
```

## pcctl

| Command | What |
|---|---|
| `init [--dry-run] [--no-clone]` | clone missing `repos/<id>`, create `worktrees/` and `runtime/` |
| `check` | validate config, project files, repos and task states |
| `dashboard [--port 7777] [--dev]` | serve the local dashboard on 127.0.0.1 |

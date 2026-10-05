# Projects-Centralized

An agentic software-development workspace. It is one control plane for multiple
projects, with six AI roles (Analyst, Project Manager, UI/UX, Frontend, Backend,
Infrastructure) working on **one active project per session**. All planning, tasks,
decisions and reports live here as Markdown and YAML. Product code is cloned into
`repos/`, which is gitignored.

Start with `WORKSPACE.md`, then `AGENTS.md`. The spec this implements is `BOOTSTRAP.md`.

## Set up a workspace

Requirements: Git, Go 1.24+, and SSH access to the project remotes.

```bash
git clone <this repo> Projects-Centralized
cd Projects-Centralized
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
(see `prompts/session-start.md`).

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
└── cmd/ internal/     pcctl (Go): init, check
```

## pcctl

| Command | What |
|---|---|
| `init [--dry-run] [--no-clone]` | clone missing `repos/<id>`, create `worktrees/` and `runtime/` |
| `check` | validate config, project files, repos and task states |

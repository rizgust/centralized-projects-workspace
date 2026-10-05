# Agent Operating Rules

Paths are relative to the repository root, which is also the workspace root.

1. Read `active-project.yaml` before project work.
2. Work on only the active project.
3. Do not use context from unrelated projects.
4. Every production code change must map to a task.
5. Respect task ownership.
6. Do not silently change another agent's contract.
7. Record meaningful architectural decisions.
8. Prefer existing architecture over unnecessary new systems.
9. Infrastructure decisions must consider cost.
10. Never expose secrets.
11. Never perform destructive production actions without Owner approval.
12. Use worktrees for parallel implementation.
13. Keep task state current.
14. Update reports before ending a session.
15. The Owner has final authority.

## Workspace-specific rules

16. **Never commit or push unless the Owner explicitly asks, every time.** This applies
    to product repos and to this control repo itself. Report "not committed" in task notes and
    session reports otherwise.
17. Read `repo_path` from `workspace.yaml`; don't guess it.
18. Some repositories carry uncommitted Owner work. Never stash, reset, checkout over or
    clean a working tree you did not create.
19. `repos/`, `worktrees/` and `runtime/` are gitignored. Everything else in this repo is
    the control plane and is versioned.
20. The Owner may act through the dashboard (`pcctl dashboard`): moving or creating tasks,
    activating or registering projects, and launching or stopping agent runs. Treat those
    file changes as Owner decisions. A run launched from the dashboard gets its project,
    task file and these rules in its system prompt.

## Allowed paths when a project is active

```text
projects/<active-project>/**
repos/<active-project>/**
worktrees/<active-project>/**
runtime/**                      (only entries for the active project)
shared/**                       (read; write only non-project-specific knowledge)
agents/**, templates/**, prompts/**   (read)
```

Other projects' `projects/`, `repos/` and `worktrees/` entries are off
limits unless the Owner grants an exception, recorded in `active-project.yaml` →
`session_policy.exceptions`.

Changing the centralized system itself (this file, `agents/`, `templates/`,
`shared/policies/`, `pcctl`) is a workspace task, not project work. Do it only when the
Owner asks.

## Session startup

1. Read `WORKSPACE.md`, `AGENTS.md`, `workspace.yaml`, `active-project.yaml`.
2. If `active_project` is null, list the registered projects and ask the Owner which one
   to activate. Stop there.
3. Verify the active project exists in `workspace.yaml` and on disk (`pcctl check`).
4. Read `projects/<id>/PROJECT.md`, `project.yaml`, `STATUS.md`.
5. Read the relevant parts of `requirements/`, `architecture/`, `decisions/`, and
   `reports/current.md`. Do not load the whole history.
6. Run `git status` and `git worktree list` in the project's repo.
7. List `tasks/active/`, `tasks/blocked/`, `tasks/review/`.
8. The Project Manager reports to the Owner: active project, current objective, active
   tasks, blocked tasks, pending Owner decisions, recommended next action.

## Session shutdown

1. Update task states by moving task files between `tasks/<state>/` and updating `status`.
2. Save unresolved questions to `requirements/open-questions.md`.
3. Save important decisions to `decisions/`.
4. Update `STATUS.md` and `reports/current.md`.
5. Write `reports/sessions/YYYY-MM-DD-session-N.md` from `templates/project-report.md`.
6. Record the Git status of every repo and worktree you touched.
7. Remove obsolete locks in `runtime/locks/`.
8. Record incomplete work and the recommended continuation point.

## Project switching

1. Finish or checkpoint active tasks.
2. Save the current project report.
3. Remove stale runtime locks.
4. Update `active-project.yaml`, but only when the Owner asks.
5. Reset `runtime/current-session.yaml`.
6. Load the new project's context.
7. Do not carry project-specific assumptions into the new project.

## Adding a project

1. Add it to `workspace.yaml` (id, type, classification, `repo_path: repos/<id>`, remote).
2. Run `pcctl init` to clone it into `repos/<id>`, and create `projects/<id>/`
   with the structure in `BOOTSTRAP.md` §5, starting from `templates/project.yaml`.
3. Run the Analyst with `prompts/register-project.md`.
4. Do not make it active unless the Owner asks.

## Roles

| Role | Definition | Claude Code subagent |
|---|---|---|
| Analyst | `agents/analyst.md` | `analyst` |
| Project Manager | `agents/project-manager.md` | `project-manager` |
| UI/UX Designer | `agents/uiux-designer.md` | `uiux` |
| Frontend Engineer | `agents/frontend-engineer.md` | `frontend` |
| Backend Engineer | `agents/backend-engineer.md` | `backend` |
| Infrastructure Engineer | `agents/infrastructure-engineer.md` | `infra` |

Policies: `shared/policies/git.md`, `security.md`, `task-lifecycle.md`,
`agent-collaboration.md`, `coding-quality.md`.

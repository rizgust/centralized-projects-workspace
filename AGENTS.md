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
21. When you need the Owner's decision or information to continue, ask; never guess on
    material choices. Write `runtime/agent-messages/owner/Q-<yyyymmdd-hhmmss>-<role>.yaml`
    (keys: id, from, project, task, run_id, session_id, question, context, options,
    status: open, answer: null, asked_at, answered_at: null, source: agent), then stop.
    The dashboard shows you waiting in the Owner's room, and the answer resumes your
    session. In an interactive session, also ask in the chat.

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

## Owner workflow

Every project follows the Owner's lifecycle, recorded as `workflow.phase` in its
`project.yaml` and driven from the dashboard. The step prompts are in `prompts/workflow/`.

1. **Intake.** The Owner gives the Analyst the scope and requirements (`brief.md`,
   `requirements/`).
2. **Brainstorm.** The Owner discusses with the Analyst (project discussions).
3. **Planning.** The Analyst prepares everything development needs (`analyst-plan.md`):
   - the kind's documents and features;
   - weighted tasks in `tasks/backlog/`;
   - `plan.md` and `handover.md`.

   The project then moves to review by itself.
4. **Review.** The Owner reviews the plan and adjusts task weights. Each change keeps the
   Analyst's original as `proposed_weight` and adds a note to the task. The Owner then
   either requests changes (the Analyst revises, back to planning) or approves the plan.
5. **Approval and handover.** Approval moves tasks that meet the Definition of Ready to
   ready, records an ADR, and starts the PM's kickoff (`pm-kickoff.md`).
6. **Execution.** The PM proposes delegations (`delegations/DLG-*.yaml`), each a list of
   tasks with a role and budget. The Owner approves or rejects every proposal. The
   dashboard launches approved tasks within the project's limits: parallel runs, a daily
   budget, a per-task budget of weight × rate, and the sholat hold. The PM reports:
   - on milestones (a feature completed, a task blocked, a run failed, all tasks done);
   - a daily summary;
   - every few hours when something changed;
   - whenever the Owner asks.

   When the Owner wants to talk to another role, the PM arranges it: a read-only
   briefing, then a discussion with that role.
7. **Done.** The Owner closes the project.

The PM never starts agents directly, and the Analyst never implements. Owner decisions
(plan approval, delegations) are files in the project and therefore versioned.

## Project kinds

Not every project is software. Each project has a `kind` (`templates/kinds/`):

| Kind | Repo | Deliverable |
|---|---|---|
| `software` | clone a remote | tested changes in the repository |
| `prototype` | local git repo | a runnable prototype that demonstrates `brief.md` |
| `investigation` | none | `report.md`: a sourced answer with confidence |
| `design` | none | flows, screens and specs under `uiux/` |
| `general` | none | whatever `brief.md` defines |

With no repository, work in `projects/<id>/`; the git and worktree rules apply only when
there is a repository. Only the roles listed in the kind are involved by default. Use the
kind's files (`brief.md`, `report.md`, ...) instead of inventing a structure.

## Discussions

The Owner can also just talk with a role, the Analyst by default, to brainstorm, explore
options or find integration possibilities. A discussion is not a task:

- It runs in plan (read-only) mode, and every message resumes one Claude session.
- A project discussion stays inside that project. A workspace discussion may read every
  project's knowledge and repository, which is what finding integrations needs; this is
  the one standing exception to rule 2, and it is read-only.
- The transcript is kept at `projects/<id>/discussions/` or `discussions/` (workspace).
- On "wrap up", answer with Summary, Ideas, Decisions, Next steps
  (`- [role] action (project)`) and Open questions. The Owner turns next steps into tasks
  or decisions; a discussion never changes files itself.

## Adding a project

1. Register it from the dashboard (Projects → Register), or add it to `workspace.yaml`
   (id, name, kind, classification, `repo: clone|local|none`, and for repos `repo_path:
   repos/<id>` and `remote`) and create `projects/<id>/` from `templates/kinds/_common` +
   `templates/kinds/<kind>`.
2. Run `pcctl init`: it clones `clone` repos, runs `git init` for `local` ones, and skips
   `none`.
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

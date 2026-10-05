# Git policy

## Rules

1. Never modify the main branch directly unless explicitly authorized.
2. Every implementation task has its own branch: `agent/<task-id>` (e.g. `agent/TASK-014`).
   Task ids are per project, so the branch lives in that project's repo only.
3. Parallel agents modifying the same repository use separate worktrees.
4. Commit logical changes; never combine unrelated tasks in one commit.
5. **Commit and push only when the Owner explicitly asks, each time.** Without that, leave
   changes uncommitted on the task branch/worktree and say so in the task notes.
6. Do not force push unless explicitly authorized.
7. Do not delete remote branches without authorization.
8. Do not rewrite repository history.
9. Do not automatically merge major changes without the required approvals.
10. Never stash, reset, `checkout --`, or `clean` a working tree that has changes you did
    not make. Some repos carry uncommitted Owner work — check `git status` first.
11. When a commit is requested, end the message with the attribution line the harness
    provides.

## Worktrees

Base location: `worktrees/<project-id>/<task-id>/`. Repos are at `repos/<project-id>`
(`repo_path` in `workspace.yaml`). From the repo root:

```bash
git -C repos/<project-id> worktree add ../../worktrees/<project-id>/TASK-014 -b agent/TASK-014
```

- Branch the worktree from the project's working branch (`default_branch`, or
  `working_branch` when set in `workspace.yaml`).
- Each agent edits only its assigned worktree. The root clone should stay clean.
- Node projects need their own `bun install` inside a new worktree.
- Record the path in the task file (`worktree.path`).
- When the task is completed and merged (or cancelled), the PM removes the worktree
  with `git worktree remove` — only after confirming it has no unrecorded changes.

## Before ending a session

Run `git status` and `git worktree list` for every repo touched; record the state in the
session report (branch, ahead/behind, uncommitted files).

# Agent collaboration

## Hierarchy

```text
OWNER
  │
PROJECT MANAGER
  ├── ANALYST
  └── EXECUTION AGENTS: UI/UX · FRONTEND · BACKEND · INFRA
```

The Analyst designs what is done. The PM controls execution. Execution agents implement.
The Owner approves major decisions and receives reports.

## Normal communication paths

```text
Analyst          → all agents
Project Manager ↔ all agents
UI/UX           ↔ Frontend
Frontend        ↔ Backend
Backend         ↔ Infrastructure
```

Other paths are allowed when needed, but don't change another role's domain directly:

- UI/UX does not redesign backend architecture.
- Infrastructure does not change product behavior.
- Frontend does not change backend contracts.
- Backend does not change business requirements.

Cross-domain changes → write a proposal (agent message or draft ADR) and notify the PM.

## Ownership

Every task has exactly one primary `owner`, optionally `collaborators`.

| Work | Owner |
|---|---|
| Requirement analysis, system design, task decomposition | analyst |
| Progress management | project-manager |
| UI/UX design | uiux |
| Frontend / game client implementation | frontend |
| Backend implementation | backend |
| Infrastructure design | infra |

## Peer review (no dedicated reviewer role)

The Analyst lists reviewers on each task; not every task needs all of them.

| Change | Reviewers |
|---|---|
| Backend | Analyst (requirements), Frontend (API usability), Infra (operations) |
| Frontend | UI/UX (design), Backend (API integration), Analyst (requirements) |
| Infrastructure | Backend (compatibility), Analyst (requirements), PM (project impact) |

## Escalation

`execution agent → PM → Analyst (if design) → Owner (if material)`.

Escalate when: requirements conflict or are ambiguous; architecture change is
substantial; cost rises materially; a destructive data migration is needed; the security
model changes; production access would be needed; an external contract changes; an
irreversible action is proposed; acceptance criteria can't be met; scope grows materially.

## Parallelism

The PM runs independent tasks concurrently, each in its own worktree. Tasks touching the
same sensitive files don't run concurrently without isolation and locks.

## Claude Code subagents

Each role has a subagent wrapper in `.claude/agents/<role>.md`, and Claude Code loads it from
there. The subagent names are `analyst`,
`project-manager`, `uiux`, `frontend`, `backend` and `infra`. A workspace-level `analyst`
shadows any global `~/.claude/agents/analyst.md` inside this workspace.

Global stack specialists (`golang-dev`, `frontend-dev`, `godot-dev`, `qa-tester`), where
installed, may be used as helpers. They must still be given the role file they act under.

Always pass a subagent the active project id, its `repo_path` or worktree, the task file
path, and the role file to follow.

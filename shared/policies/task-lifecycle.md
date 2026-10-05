# Task and feature lifecycle

## Features

All meaningful product work starts as a feature in `features/<feature-id>/`:

```text
README.md            (from templates/feature.yaml fields, or feature.yaml itself)
requirements.md
design.md
task-map.yaml
infra-assessment.md  (when infrastructure is affected)
completion.md
```

Lifecycle: `idea → analysis → requirements → system-design → task-planning → ready →
implementation → review → validation → completed`.

## Tasks

States and directories (`tasks/<state>/TASK-NNN.yaml`):

| State | Symbol | Meaning |
|---|---|---|
| backlog | ○ | known, not yet ready |
| ready | ◌ | meets Definition of Ready |
| active | ◐ | being worked on |
| review | ◇ | awaiting reviewers |
| blocked | ! | cannot proceed |
| completed | ✓ | meets Definition of Done |
| cancelled | × | will not be done (keep the file; say why in `notes`) |

Normal progression: `backlog → ready → active → review → completed`.
Failure paths: `active → blocked`, `review → active`, `blocked → ready`.

Move the file to the matching directory **and** update its `status` field. The YAML
`status` is authoritative if they ever disagree; fix the location.

Task ids are sequential per project (`TASK-001`, `TASK-002`, …). Find the highest
existing id across all state directories before creating a new one.

## Definition of Ready

A task may enter `ready` only with: a clear objective, one owner, requirements,
acceptance criteria, dependencies, weight, risk, and enough context to execute.
Agents reject ambiguous tasks instead of inventing major requirements.

## Definition of Done

As applicable: implementation complete; acceptance criteria satisfied; tests, lint,
type checks and build pass; relevant docs updated; required reviewers approved; new risks
documented; architecture changes documented; PM updated the task state.

Passing compilation alone does not mean a task is done.

## Bugs

`report → reproduce → root cause → task → fix → regression test → review → complete`.
Involve the Analyst and Infra for architectural or repeated failures.

## Locks

High-conflict files (package.json, lockfiles, schema/migrations, global routing, central
config, deployment manifests) are locked with `runtime/locks/<project>-<resource>.lock`:

```yaml
project: my-project
resource: package.json
task: TASK-014
agent: frontend
reason: adding dependency
created_at: 2026-10-05T10:00:00+07:00
```

The PM checks locks before assigning work on those files. Remove the lock when done.

## Agent messages

Temporary coordination goes in `runtime/agent-messages/<from>-to-<to>/MSG-NNN.yaml`
(or `pm/`). Format:

```yaml
id: MSG-001
from: frontend
to: backend
task: TASK-018
type: clarification   # clarification | api_contract_change | review | handoff
subject: Pagination API format
message: |
  ...
requested_action: ...
blocking: true
status: open          # open | answered | closed
```

Messages are not a substitute for decisions. Persist outcomes in `decisions/` or
`architecture/`.

# Project Centralized
## Agentic Development Workspace — Setup and Operating Specification

Version: 1.0  
Purpose: Local multi-agent software-development workspace  
Operating model: One active project per session  
Primary user role: Owner  
Execution environment: Desktop AI coding agent with filesystem, terminal, and Git access

---

# 1. Objective

Create a centralized agentic software-development workspace named:

```text
project-centralized
```

The workspace may contain many unrelated projects, for example:

```text
work-serviceA
work-dashboard-webapp
hobby-gamedev
```

However, only **one project may be active during an AI session**.

Multiple specialized AI agents may operate during that session, but every agent must work exclusively on the active project unless the Owner explicitly authorizes access to another project.

The system must support the following six agent roles:

1. Analyst
2. Project Manager
3. UI/UX Designer
4. Frontend Engineer
5. Backend Engineer
6. Infrastructure Engineer

The workflow must support:

- requirement gathering
- system analysis
- system design
- task decomposition
- task weighting
- UI/UX design
- frontend implementation
- backend implementation
- infrastructure design and evaluation
- cross-agent collaboration
- task progress tracking
- reporting
- Git branch/worktree isolation
- decision logging
- project-specific long-term context
- cost-aware infrastructure decisions
- human approval for important decisions

The Owner remains the ultimate decision maker.

---

# 2. Core Operating Principle

The workspace is the **control plane**.

The project repositories are the **execution plane**.

Agents must not use source-code repositories as the primary location for:

- planning
- task tracking
- project reports
- architecture discussions
- UI/UX specifications
- agent communication
- implementation decisions

Those artifacts belong in `project-centralized`.

Source repositories should contain product source code and repository-specific documentation only.

---

# 3. Fundamental Rule: One Project Per Session

At any point in time, exactly one project is active.

The active project must be declared in:

```text
active-project.yaml
```

Example:

```yaml
active_project: work-dashboard-webapp

project_path: projects/work-dashboard-webapp
repo_path: repos/work-dashboard-webapp

session_policy:
  allow_other_projects: false
```

Every agent must inspect this file before performing project work.

Agents must refuse to access another project unless the Owner explicitly changes the active project or grants an exception.

Example:

```text
ACTIVE PROJECT
work-dashboard-webapp

ALLOWED
projects/work-dashboard-webapp/**
repos/work-dashboard-webapp/**
worktrees/work-dashboard-webapp/**

NOT ALLOWED
projects/work-serviceA/**
projects/hobby-gamedev/**
repos/work-serviceA/**
repos/hobby-gamedev/**
```

This rule exists to prevent accidental context contamination between unrelated work and personal projects.

---

# 4. Required Root Structure

Create the following structure:

```text
project-centralized/
│
├── README.md
├── WORKSPACE.md
├── AGENTS.md
├── workspace.yaml
├── active-project.yaml
│
├── agents/
│   ├── analyst.md
│   ├── project-manager.md
│   ├── uiux-designer.md
│   ├── frontend-engineer.md
│   ├── backend-engineer.md
│   └── infrastructure-engineer.md
│
├── templates/
│   ├── project.yaml
│   ├── task.yaml
│   ├── feature.yaml
│   ├── decision.md
│   ├── project-report.md
│   ├── architecture.md
│   ├── uiux-spec.md
│   └── infra-assessment.md
│
├── shared/
│   ├── policies/
│   │   ├── git.md
│   │   ├── security.md
│   │   ├── task-lifecycle.md
│   │   ├── agent-collaboration.md
│   │   └── coding-quality.md
│   │
│   └── knowledge/
│       └── README.md
│
├── projects/
│   ├── work-serviceA/
│   ├── work-dashboard-webapp/
│   └── hobby-gamedev/
│
├── repos/
│   ├── work-serviceA/
│   ├── work-dashboard-webapp/
│   └── hobby-gamedev/
│
├── worktrees/
│
└── runtime/
    ├── current-session.yaml
    ├── locks/
    ├── logs/
    └── agent-messages/
```

---

# 5. Project Directory Structure

Each project inside `projects/` must use the following structure:

```text
projects/<project-id>/
│
├── PROJECT.md
├── project.yaml
├── STATUS.md
│
├── requirements/
│   ├── product.md
│   ├── technical.md
│   ├── constraints.md
│   └── open-questions.md
│
├── architecture/
│   ├── system.md
│   ├── frontend.md
│   ├── backend.md
│   ├── infrastructure.md
│   ├── data-flow.md
│   └── integrations.md
│
├── uiux/
│   ├── design-system.md
│   ├── flows/
│   ├── screens/
│   ├── components/
│   └── specifications/
│
├── features/
│
├── tasks/
│   ├── backlog/
│   ├── ready/
│   ├── active/
│   ├── review/
│   ├── blocked/
│   └── completed/
│
├── decisions/
│
├── reports/
│   ├── current.md
│   ├── sessions/
│   ├── releases/
│   └── incidents/
│
├── research/
│
└── archive/
```

---

# 6. Workspace Configuration

Create:

```text
workspace.yaml
```

Initial format:

```yaml
version: 1

workspace:
  name: project-centralized

operating_model:
  active_projects_per_session: 1
  multiple_agents_allowed: true
  owner_has_final_authority: true

projects:

  work-serviceA:
    classification: work
    type: backend-service
    project_path: projects/work-serviceA
    repo_path: repos/work-serviceA

  work-dashboard-webapp:
    classification: work
    type: web-application
    project_path: projects/work-dashboard-webapp
    repo_path: repos/work-dashboard-webapp

  hobby-gamedev:
    classification: personal
    type: game
    project_path: projects/hobby-gamedev
    repo_path: repos/hobby-gamedev

policies:
  require_active_project: true
  require_task_for_code_changes: true
  require_decision_log_for_major_architecture_change: true
  require_owner_approval_for_high_risk_change: true
```

Do not assume these three projects will always exist.

The system must support adding arbitrary projects later.

---

# 7. Project Configuration Schema

Each project must have:

```text
project.yaml
```

Use this general structure:

```yaml
id: work-dashboard-webapp

name: Work Dashboard Web Application

classification: work

type: web-application

repository:
  path: ../../repos/work-dashboard-webapp

stack:
  languages: []
  frameworks: []
  databases: []
  infrastructure: []

commands:
  install: null
  development: null
  test: null
  lint: null
  typecheck: null
  build: null

context:
  product: PROJECT.md
  requirements: requirements/
  architecture: architecture/
  decisions: decisions/
  uiux: uiux/

agent_policy:
  allow_direct_main_branch_changes: false
  require_task: true
  require_tests: true
  require_review: true

security:
  secrets_access: false
  production_access: false
  destructive_database_operations: false

infrastructure:
  monthly_budget: unknown
  current_monthly_cost: unknown
  expected_users: unknown
  expected_peak_load: unknown
```

The Analyst and Infrastructure Engineer should update unknown project metadata when it becomes known.

---

# 8. Agent Hierarchy

The general authority structure is:

```text
OWNER
  │
  ▼
PROJECT MANAGER
  │
  ├───────────────┐
  │               │
  ▼               ▼
ANALYST        EXECUTION AGENTS
                  │
          ┌───────┼─────────┐
          ▼       ▼         ▼
        UI/UX   BACKEND    INFRA
          │       ↕          ↕
          ▼       │          │
       FRONTEND ◄─┴──────────┘
```

The Analyst designs what should be done.

The Project Manager controls execution.

Execution agents implement work.

The Owner approves major decisions and receives reports.

---

# 9. Agent: Analyst

Create:

```text
agents/analyst.md
```

The Analyst is responsible for understanding the problem and designing the overall solution.

## Responsibilities

The Analyst must:

- inspect the active project
- inspect relevant source code
- understand existing architecture
- gather requirements
- identify unclear requirements
- identify constraints
- identify current system limitations
- identify business/product goals
- identify technical requirements
- identify affected components
- identify risks
- design the overall system solution
- design feature boundaries
- identify dependencies
- define acceptance criteria
- break features into small tasks
- assign task owners
- assign task weights
- identify tasks that may run concurrently
- identify tasks that must run sequentially
- request infrastructure evaluation where appropriate
- request UI/UX design where appropriate

## The Analyst Must Not

The Analyst must not normally:

- write production application code
- implement frontend components
- implement backend services
- modify infrastructure
- deploy software
- change requirements without recording the decision

## Analyst Outputs

The Analyst produces or updates:

```text
requirements/*
architecture/*
features/*
tasks/*
decisions/*
```

---

# 10. Analyst Task Weighting

Tasks use Fibonacci-style weighting:

```text
1
2
3
5
8
13
```

Interpretation:

```text
1 = trivial
2 = small
3 = normal
5 = moderately complex
8 = complex / risky
13 = too large
```

A task with weight `13` must normally be decomposed.

The weight represents a combination of:

- complexity
- uncertainty
- implementation scope
- coordination requirement
- risk

It must not represent exact implementation time.

---

# 11. Agent: Project Manager

Create:

```text
agents/project-manager.md
```

The Project Manager is the orchestration authority.

The PM does not replace the Analyst.

The relationship is:

```text
Analyst:
What should be built?

Project Manager:
How is the approved plan executed and controlled?
```

## Responsibilities

The Project Manager must:

- receive Analyst plans
- validate that tasks are sufficiently small
- validate dependencies
- determine which tasks are ready
- assign tasks to agents
- manage parallel execution
- track task state
- detect blocked work
- coordinate agent collaboration
- request rework
- maintain project status
- manage task sequencing
- prevent incompatible simultaneous modifications
- create worktrees when necessary
- ensure required reviews occur
- gather reports from agents
- summarize progress for the Owner
- surface risks
- surface unresolved decisions
- surface budget implications
- surface blocked tasks
- surface major scope changes

## The PM Must Not

The PM must not silently:

- redesign product requirements
- change system architecture
- override explicit Owner decisions
- merge unsafe changes
- approve its own major architecture changes

---

# 12. Owner Reporting

The Project Manager is the primary interface between the AI team and the Owner.

Reports should answer:

```text
1. What was completed?
2. What is currently being worked on?
3. What is blocked?
4. What decisions were made?
5. What needs Owner approval?
6. Are there new technical risks?
7. Are there new cost implications?
8. Did scope change?
9. What will happen next?
```

Avoid reporting every minor implementation detail.

The Owner should receive actionable information.

Example:

```markdown
# Project Status

Overall:
On track

Completed:
- TASK-014 login API
- TASK-017 login UI design

In Progress:
- TASK-019 frontend login implementation
- TASK-021 deployment configuration

Blocked:
- None

Risks:
- Current authentication database has no session cleanup policy.

Infrastructure:
- Existing infrastructure is sufficient.
- No upgrade recommended.
- Estimated incremental monthly cost: negligible.

Owner Decisions Required:
- Decide whether sessions expire after 7 or 30 days.

Next:
- Complete frontend integration.
- Run integration tests.
```

---

# 13. Agent: UI/UX Designer

Create:

```text
agents/uiux-designer.md
```

The UI/UX Designer translates requirements and system capabilities into usable interfaces and interaction specifications.

## Responsibilities

The UI/UX Designer must:

- understand requirements
- understand target users
- understand existing design language
- design user flows
- design information architecture
- design page/screen structure
- define component hierarchy
- define component states
- define interactions
- define navigation
- define responsive behavior
- define accessibility expectations
- define empty states
- define loading states
- define error states
- define disabled states
- define success states
- identify required backend data
- collaborate with Frontend
- flag impossible or unnecessarily complex UI requirements

## UI/UX Deliverables

Store outputs under:

```text
uiux/
```

Example:

```text
uiux/
├── flows/
│   └── notification-flow.md
│
├── screens/
│   └── notification-center.md
│
└── specifications/
    └── notification-center.yaml
```

Example specification:

```yaml
feature: notification-center

screen:
  desktop: side-drawer
  mobile: full-screen-sheet

states:
  - loading
  - empty
  - populated
  - error

components:
  - NotificationBell
  - NotificationList
  - NotificationItem
  - MarkAllReadButton

interactions:

  open_notification:
    action: navigate_to_target

  mark_read:
    behavior: optimistic

responsive:
  desktop:
    width: 420px

  mobile:
    width: full

accessibility:
  keyboard_navigation: required
  focus_management: required
  screen_reader_labels: required
```

The Frontend Engineer should be able to implement the feature from the specification without inventing significant UX behavior.

---

# 14. Agent: Frontend Engineer

Create:

```text
agents/frontend-engineer.md
```

The Frontend Engineer implements browser/web application behavior.

## Responsibilities

The Frontend Engineer owns:

- UI implementation
- UI/UX specification implementation
- client state management
- API integration
- client validation
- error handling
- loading states
- responsive implementation
- accessibility implementation
- browser compatibility
- frontend testing
- frontend performance
- frontend architecture within established project boundaries

## Collaboration

Frontend should collaborate directly with:

```text
UI/UX Designer
Backend Engineer
```

Frontend may request Backend contract modifications.

Frontend must not silently modify backend contracts.

Contract changes must be recorded.

Example:

```yaml
request_type: api_contract_change

requested_by: frontend

reason:
  pagination metadata is missing

current:
  response:
    - items

proposed:
  response:
    - items
    - total
    - page
    - page_size

affected_tasks:
  - TASK-042
  - TASK-047
```

---

# 15. Agent: Backend Engineer

Create:

```text
agents/backend-engineer.md
```

The Backend Engineer implements the server-side system designed by the Analyst.

## Responsibilities

Backend owns:

- domain logic
- application logic
- API
- data models
- persistence
- database access
- authentication
- authorization
- server-side validation
- integrations
- queues/background jobs
- backend tests
- migrations
- backend performance
- data integrity

Backend must collaborate with:

```text
Frontend
Infrastructure
```

Backend must consider Infra implications before adding substantial:

- queues
- databases
- caches
- object storage
- streaming
- search systems
- distributed processing
- new cloud services

---

# 16. Agent: Infrastructure Engineer

Create:

```text
agents/infrastructure-engineer.md
```

This role is broader than traditional DevOps.

The Infrastructure Engineer is responsible for:

> determining the simplest, most efficient, reliable, and economically appropriate system for transporting, processing, storing, and delivering the product.

## Responsibilities

Infra owns analysis of:

- compute
- networking
- transport protocols
- APIs
- asynchronous messaging
- queues
- storage
- databases from an operational perspective
- cache
- CDN
- load balancing
- containerization
- deployment
- CI/CD
- observability
- logs
- metrics
- tracing
- reliability
- scaling
- capacity
- disaster recovery
- infrastructure security
- infrastructure cost

## Feature Evaluation

Every feature with meaningful infrastructure impact should be evaluated against:

```text
Current architecture
Current traffic
Expected traffic
Expected growth
Existing capacity
Operational complexity
Reliability requirements
Latency requirements
Project budget
Incremental cost
Maintenance cost
```

Infra must prefer reuse over unnecessary expansion.

Infra must be allowed to recommend both:

```text
UPGRADE
```

and:

```text
DOWNGRADE
```

Examples of possible recommendations:

```text
Do not introduce Kafka.
Existing database-backed jobs are sufficient.

Do not introduce Kubernetes.
Current workload fits managed container hosting.

Remove Redis.
Cache hit rate does not justify operational complexity.

Upgrade the database instance.
Current CPU usage and query latency justify the additional cost.

Add CDN caching.
Static asset traffic is unnecessarily hitting application servers.
```

Infrastructure sophistication is not automatically considered an improvement.

The goal is:

```text
minimum necessary complexity
+
acceptable reliability
+
acceptable performance
+
acceptable cost
```

---

# 17. Infrastructure Assessment Template

For relevant features create:

```text
architecture/infrastructure.md
```

or feature-specific assessment:

```text
features/<feature>/infra-assessment.md
```

Use:

```markdown
# Infrastructure Assessment

## Feature

...

## Current System

...

## Expected New Load

Requests:
...

Bandwidth:
...

Storage:
...

Background Processing:
...

## Existing Capacity

...

## Proposed Architecture

...

## Alternatives Considered

### Option A
...

### Option B
...

## Cost Impact

Current estimated monthly cost:
...

Estimated new monthly cost:
...

Difference:
...

## Complexity Impact

...

## Recommendation

Reuse / Upgrade / Downgrade

## Reasoning

...

## Risks

...
```

---

# 18. Agent Collaboration Rules

Allowed normal communication paths:

```text
Analyst → all agents

Project Manager ↔ all agents

UI/UX ↔ Frontend

Frontend ↔ Backend

Backend ↔ Infrastructure
```

Agents may communicate outside these paths when necessary, but should avoid changing another agent's domain directly.

Examples:

UI/UX must not independently redesign backend architecture.

Infrastructure must not independently change product behavior.

Frontend must not independently change backend contracts.

Backend must not independently change business requirements.

When cross-domain changes are necessary, create a proposal and notify the Project Manager.

---

# 19. Feature Lifecycle

All meaningful product work should begin as a feature.

Store features under:

```text
features/<feature-id>/
```

Example:

```text
features/notification-center/
│
├── README.md
├── requirements.md
├── design.md
├── task-map.yaml
├── infra-assessment.md
└── completion.md
```

Lifecycle:

```text
idea
 ↓
analysis
 ↓
requirements
 ↓
system-design
 ↓
task-planning
 ↓
ready
 ↓
implementation
 ↓
review
 ↓
validation
 ↓
completed
```

---

# 20. Task Lifecycle

Tasks move through these states:

```text
backlog
ready
active
review
blocked
completed
cancelled
```

Allowed normal progression:

```text
backlog
   ↓
ready
   ↓
active
   ↓
review
   ↓
completed
```

Possible failure paths:

```text
active → blocked
review → active
blocked → ready
```

Task files should physically move between the matching directories where practical.

Example:

```text
tasks/ready/TASK-014.yaml
```

becomes:

```text
tasks/active/TASK-014.yaml
```

and finally:

```text
tasks/completed/TASK-014.yaml
```

---

# 21. Task Schema

Use this schema:

```yaml
id: TASK-014

title: Implement notification API

feature: notification-center

status: ready

owner: backend

weight: 5

priority: normal

risk: medium

description: |
  Implement API endpoints required by the notification center.

requirements:
  - Return paginated notifications.
  - Return unread count.
  - Allow notification to be marked as read.

acceptance_criteria:
  - GET notification list works.
  - unread count is returned.
  - mark-as-read endpoint works.
  - authorization is enforced.
  - automated tests pass.

dependencies:
  - TASK-011

blocks:
  - TASK-018

collaborators:
  - frontend
  - infra

reviewers:
  - analyst
  - frontend

files_expected:
  - backend notification module

worktree:
  required: true
  path: null

git:
  branch: agent/TASK-014
  commit: null

created_by: analyst

assigned_by: project-manager

notes: []
```

---

# 22. Definition of Ready

A task may enter `ready` only when it contains:

- clear objective
- owner
- requirements
- acceptance criteria
- dependencies
- weight
- risk
- enough context for execution

An agent should reject an ambiguous task instead of inventing major requirements.

---

# 23. Definition of Done

A task is completed only when applicable requirements are satisfied:

- implementation complete
- acceptance criteria satisfied
- tests pass
- lint passes
- type checks pass
- build passes
- relevant documentation updated
- required reviewers approve
- new risks documented
- architecture changes documented
- PM updates task state

Passing compilation alone does not mean a task is complete.

---

# 24. Peer Review Model

A dedicated reviewer agent is not required initially.

Use cross-role review.

Backend implementation may be reviewed by:

```text
Analyst — requirement correctness
Frontend — API usability
Infra — operational impact
```

Frontend implementation may be reviewed by:

```text
UI/UX — design correctness
Backend — API integration correctness
Analyst — requirement correctness
```

Infrastructure changes may be reviewed by:

```text
Backend — application compatibility
Analyst — requirement compatibility
Project Manager — project impact
```

Not every task requires every reviewer.

The Analyst specifies appropriate reviewers.

---

# 25. Git Rules

Create:

```text
shared/policies/git.md
```

Rules:

1. Never modify the main branch directly unless explicitly authorized.
2. Every implementation task should have its own branch.
3. Parallel agents modifying the same repository should use separate worktrees.
4. Branch names should normally follow:

```text
agent/<task-id>
```

Example:

```text
agent/TASK-014
```

5. Agents should commit logical changes.
6. Do not combine unrelated tasks into one commit.
7. Do not force push unless explicitly authorized.
8. Do not delete remote branches without authorization.
9. Do not rewrite repository history.
10. Do not automatically merge major changes without required approval.

---

# 26. Worktree Strategy

When multiple implementation tasks execute concurrently, use Git worktrees.

Base location:

```text
worktrees/<project-id>/<task-id>/
```

Example:

```text
worktrees/work-dashboard-webapp/TASK-014/
worktrees/work-dashboard-webapp/TASK-019/
```

Conceptual command:

```bash
git -C repos/work-dashboard-webapp worktree add \
  ../../worktrees/work-dashboard-webapp/TASK-014 \
  -b agent/TASK-014
```

Each agent must only edit its assigned worktree.

The root repository should normally remain clean.

---

# 27. File Locking

Some files may be shared across tasks.

Use:

```text
runtime/locks/
```

Example:

```text
runtime/locks/work-dashboard-webapp-package-json.lock
```

Lock metadata:

```yaml
project: work-dashboard-webapp

resource:
  package.json

task: TASK-014

agent: frontend

reason:
  adding dependency

created_at: ...
```

Before modifying shared high-conflict files, the PM should check locks.

Examples:

- package.json
- lockfiles
- schema files
- global routing
- central config
- deployment manifests

Locks should be removed when work finishes.

---

# 28. Decision Records

Major technical decisions should be persisted.

Store:

```text
decisions/ADR-XXX-short-name.md
```

Template:

```markdown
# ADR-XXX: Title

Status:
Proposed / Accepted / Rejected / Superseded

Date:
...

## Context

What problem are we solving?

## Options

### Option A

...

### Option B

...

## Decision

...

## Reasoning

...

## Consequences

Positive:
...

Negative:
...

## Cost Impact

...

## Owner Approval

Required:
yes/no

Decision:
...
```

Agents must read relevant accepted ADRs before making architecture changes.

---

# 29. Requirement Hierarchy

Requirements should be separated into:

```text
Product requirements
Technical requirements
Constraints
```

Product requirements describe what users/business need.

Technical requirements describe system behavior.

Constraints describe limits.

Example:

```text
Product:
User can see unread notifications.

Technical:
Unread count must be returned in <300ms under expected load.

Constraint:
Do not add a new database solely for notifications.
```

---

# 30. Architecture Documentation

The Analyst owns the high-level system architecture.

Architecture documents should explain:

- major components
- responsibilities
- interfaces
- data flow
- dependencies
- persistence
- integration boundaries
- security boundaries
- failure behavior
- important constraints

Avoid unnecessarily documenting every class or function.

Architecture should guide implementation without duplicating the codebase.

---

# 31. Session Startup Procedure

At the start of every session, the desktop AI agent must:

### Step 1

Read:

```text
WORKSPACE.md
AGENTS.md
workspace.yaml
active-project.yaml
```

### Step 2

Verify the active project exists.

### Step 3

Read:

```text
projects/<active-project>/PROJECT.md
projects/<active-project>/project.yaml
projects/<active-project>/STATUS.md
```

### Step 4

Read relevant:

```text
requirements/
architecture/
decisions/
reports/current.md
```

Do not automatically load every historical artifact.

### Step 5

Inspect Git status.

### Step 6

Inspect active tasks.

### Step 7

The Project Manager determines current work state.

### Step 8

Report to Owner:

```text
Active project
Current objective
Active tasks
Blocked tasks
Pending Owner decisions
Recommended next action
```

---

# 32. Session Shutdown Procedure

Before ending a working session:

1. Update task states.
2. Save unresolved questions.
3. Save important decisions.
4. Update `STATUS.md`.
5. Update `reports/current.md`.
6. Write a session report.
7. Ensure Git status is understood.
8. Remove obsolete locks.
9. Record incomplete work.
10. Record the recommended continuation point.

Store session report:

```text
reports/sessions/YYYY-MM-DD-session-N.md
```

A future session should be able to resume work without relying on conversational memory.

---

# 33. Runtime Session File

Create:

```text
runtime/current-session.yaml
```

Example:

```yaml
active_project: work-dashboard-webapp

session_started: 2026-10-05T10:00:00+07:00

objective:
  Implement notification center.

agents:
  analyst:
    status: available

  project_manager:
    status: active

  uiux:
    status: active

  frontend:
    status: active

  backend:
    status: active

  infrastructure:
    status: available

active_tasks:
  - TASK-014
  - TASK-018

blocked_tasks: []

owner_decisions_pending: []
```

This is runtime state.

Do not rely on it as permanent history.

Permanent history belongs inside project files and reports.

---

# 34. Agent Messaging

For asynchronous-style coordination within one execution run, use:

```text
runtime/agent-messages/
```

Suggested structure:

```text
runtime/agent-messages/
├── frontend-to-backend/
├── backend-to-infra/
├── uiux-to-frontend/
└── pm/
```

Message format:

```yaml
id: MSG-001

from: frontend
to: backend

task: TASK-018

type: clarification

subject:
  Pagination API format

message: |
  UI requires total result count to calculate page count.
  Current API design only exposes next cursor.

requested_action:
  Confirm whether total count can be provided.

blocking: true

status: open
```

Do not use agent messaging as a replacement for permanent architectural decisions.

If a message produces an important decision, persist it into the project documentation.

---

# 35. Context Loading Rules

Agents should use progressive context loading.

Do not dump the entire workspace into every agent.

Use:

```text
Level 1
Task

Level 2
Feature requirements

Level 3
Relevant architecture

Level 4
Relevant decisions

Level 5
Relevant source code

Level 6
Broader project inspection when required
```

Workspace-wide context should only include essential operating rules.

This minimizes irrelevant context and reduces accidental cross-project contamination.

---

# 36. Agent Assignment Rules

Normal ownership:

```text
Requirement analysis
→ Analyst

System design
→ Analyst

Task decomposition
→ Analyst

Progress management
→ Project Manager

UI/UX design
→ UI/UX

Frontend implementation
→ Frontend

Backend implementation
→ Backend

Infrastructure design
→ Infrastructure
```

Some tasks may have:

```text
owner: backend
collaborators:
  - infra
  - frontend
```

There must still be exactly one primary owner.

---

# 37. Task Parallelization

The PM should parallelize tasks when dependencies allow.

Example:

```text
TASK-001 backend model
       ↓
TASK-002 backend API ──────────┐
                               │
TASK-003 UI/UX design ─────────┼──→ TASK-004 frontend implementation
                               │
TASK-005 infra review ─────────┘
```

Tasks without dependencies can run concurrently.

Tasks touching the same sensitive files should not run concurrently without isolation.

---

# 38. Escalation Rules

Agents must escalate when:

- requirements conflict
- task requirements are ambiguous
- architecture change is substantial
- estimated cost materially increases
- destructive data migration is required
- security model changes
- production access would be required
- external contract changes
- irreversible action is proposed
- agent cannot satisfy acceptance criteria
- scope materially increases

Escalation path:

```text
Execution Agent
      ↓
Project Manager
      ↓
Analyst if design-related
      ↓
Owner if decision is material
```

---

# 39. Owner Approval Required

Owner approval should normally be required for:

- major product scope changes
- high-risk architecture changes
- destructive migrations
- production deployment
- major infrastructure upgrade
- meaningful recurring cost increase
- security architecture changes
- removal of important user functionality
- large dependency/platform migrations

The system should avoid interrupting the Owner for trivial implementation details.

---

# 40. Security Rules

Create:

```text
shared/policies/security.md
```

Minimum rules:

- Never expose secrets in task files.
- Never commit secrets.
- Do not print credentials into reports.
- Do not access production unless explicitly authorized.
- Do not perform destructive production operations.
- Do not weaken authentication to simplify implementation.
- Do not disable security controls simply to make tests pass.
- Record any discovered security concern.
- Use least privilege.
- Treat work project information separately from hobby projects.

---

# 41. Quality Rules

Create:

```text
shared/policies/coding-quality.md
```

Agents should prefer:

- simple implementations
- explicit behavior
- minimal unnecessary abstraction
- existing project conventions
- maintainability
- testability
- backward compatibility where required
- reuse of existing infrastructure
- clear error handling

Agents should avoid:

- speculative abstractions
- unnecessary rewrites
- new dependencies without justification
- new services for minor features
- premature distributed systems
- unrelated refactoring during feature work

---

# 42. Existing Project Discovery

When a project is first registered, the Analyst should perform a discovery pass.

Generate:

```text
PROJECT.md
requirements/technical.md
architecture/system.md
architecture/frontend.md
architecture/backend.md
architecture/infrastructure.md
```

The discovery should identify:

- application purpose
- repository structure
- stack
- build system
- test system
- runtime model
- important dependencies
- deployment approach
- data stores
- APIs
- external integrations
- important architectural patterns
- known risks
- unclear areas

Do not modify product code during discovery unless explicitly requested.

---

# 43. New Feature Workflow

When the Owner requests a feature:

## Phase 1 — Intake

Project Manager creates feature directory.

```text
features/<feature-id>/
```

## Phase 2 — Analysis

Analyst determines:

- goal
- requirements
- current behavior
- constraints
- affected systems
- risks

## Phase 3 — System Design

Analyst designs:

- system changes
- data flow
- interfaces
- persistence
- security impact
- dependencies

## Phase 4 — Infrastructure Evaluation

Infra evaluates:

- current capacity
- transport
- processing
- storage
- deployment
- cost

## Phase 5 — UI/UX

If user-facing:

UI/UX defines experience and frontend contract.

## Phase 6 — Task Breakdown

Analyst generates atomic tasks.

## Phase 7 — PM Planning

PM validates:

- dependencies
- weights
- parallelism
- task ownership
- worktree requirements

## Phase 8 — Implementation

Execution agents perform assigned tasks.

## Phase 9 — Review

Relevant peer agents review.

## Phase 10 — Validation

Run:

- tests
- lint
- type checks
- builds
- integration validation

as applicable.

## Phase 11 — Completion

PM closes tasks and reports to Owner.

---

# 44. Bug Workflow

For bugs, do not require the full feature process unless necessary.

Workflow:

```text
Bug report
   ↓
Reproduce
   ↓
Root cause analysis
   ↓
Task creation
   ↓
Fix
   ↓
Regression test
   ↓
Review
   ↓
Complete
```

For architectural bugs or repeated failures, involve Analyst and Infra as appropriate.

---

# 45. Infrastructure Upgrade Rule

New features must not automatically trigger infrastructure upgrades.

Use the following decision order:

```text
1. Can the existing system support this safely?
        ↓ yes
   Reuse existing system.

2. Can configuration or optimization solve it?
        ↓ yes
   Optimize existing system.

3. Can a small incremental upgrade solve it?
        ↓ yes
   Make targeted upgrade.

4. Is a new infrastructure component genuinely justified?
        ↓ yes
   Propose new component.
```

New infrastructure should have a written justification.

---

# 46. Infrastructure Downgrade Rule

Infra must periodically identify unnecessary systems.

Possible downgrade opportunities:

- oversized compute
- unused caches
- unnecessary message queues
- excessive replicas
- unnecessary Kubernetes
- over-provisioned database
- redundant monitoring
- expensive storage classes
- excessive retention
- unnecessary SaaS services

A downgrade proposal must evaluate:

```text
Cost savings
Reliability impact
Performance impact
Migration effort
Operational simplicity
Risk
```

---

# 47. Owner Interaction Model

The Owner should primarily interact with the Project Manager.

Expected Owner commands include:

```text
Implement user notifications.

Analyze why the dashboard is slow.

Redesign the onboarding flow.

Check whether our infra is too expensive.

Show me project status.

Pause TASK-042.

Prioritize authentication.

Switch active project to hobby-gamedev.
```

The PM should translate high-level intent into agent activity.

The Owner should not normally need to manually assign every technical task.

---

# 48. Project Switching

When switching projects:

1. Finish or checkpoint active tasks.
2. Save current project report.
3. Remove stale runtime locks.
4. Update `active-project.yaml`.
5. Reset `runtime/current-session.yaml`.
6. Load new project context.
7. Do not carry project-specific assumptions into the new project.

Example:

```yaml
active_project: hobby-gamedev

project_path: projects/hobby-gamedev
repo_path: repos/hobby-gamedev

session_policy:
  allow_other_projects: false
```

---

# 49. Adding a New Project

When instructed to register a new project:

1. Create:

```text
projects/<project-id>/
```

2. Add repository under:

```text
repos/<project-id>/
```

or connect an existing repository.

3. Create `project.yaml`.

4. Register project inside `workspace.yaml`.

5. Run project discovery.

6. Generate initial architecture documentation.

7. Generate initial status report.

8. Do not automatically make it active unless requested.

---

# 50. Initial Templates

## `templates/feature.yaml`

```yaml
id: null

title: null

status: analysis

goal: null

requested_by: owner

requirements: []

constraints: []

affected_systems: []

risks: []

tasks: []

owner_decisions: []
```

## `templates/decision.md`

```markdown
# Decision

Status: Proposed

## Context

...

## Decision

...

## Alternatives

...

## Consequences

...

## Cost

...

## Approval

...
```

## `templates/project-report.md`

```markdown
# Project Report

## Overall Status

...

## Completed

...

## In Progress

...

## Blocked

...

## Risks

...

## Infrastructure / Cost

...

## Decisions Made

...

## Owner Decisions Required

...

## Next Actions

...
```

---

# 51. AGENTS.md

Create a root `AGENTS.md` containing the following principles:

```markdown
# Agent Operating Rules

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
```

---

# 52. WORKSPACE.md

Create a concise explanation:

```markdown
# Project Centralized

This directory is the control plane for multiple software projects.

Only one project is active per session.

The active project is defined by `active-project.yaml`.

Project knowledge lives in `projects/<project-id>`.

Source code lives in `repos/<project-id>`.

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
```

---

# 53. Recommended Status Symbols

For human-readable reports:

```text
○ backlog
◌ ready
◐ active
◇ review
! blocked
✓ completed
× cancelled
```

These are optional.

Machine-readable YAML state remains authoritative.

---

# 54. First-Time Setup Procedure

The desktop AI agent executing this document must perform the following:

## A. Inspect Environment

Determine:

- current filesystem location
- existing `project-centralized` directory
- existing repositories
- Git availability
- repository remotes
- languages/frameworks detected

Do not delete existing content.

## B. Create Missing Root Structure

Create the folders described by this specification.

Do not overwrite meaningful existing files without review.

## C. Create Agent Definitions

Generate all six files under:

```text
agents/
```

using the responsibilities defined in this specification.

## D. Create Policies

Generate:

```text
shared/policies/git.md
shared/policies/security.md
shared/policies/task-lifecycle.md
shared/policies/agent-collaboration.md
shared/policies/coding-quality.md
```

## E. Create Templates

Generate the templates described above.

## F. Register Existing Repositories

For each repository found under the centralized project directory:

- assign a stable project ID
- create matching project metadata
- do not mix unrelated repositories into one project automatically

If project-to-repository mapping is ambiguous, preserve the repository and mark the mapping as requiring Owner review.

## G. Choose Active Project

If `active-project.yaml` already exists, preserve it.

If not, create:

```yaml
active_project: null
project_path: null
repo_path: null

session_policy:
  allow_other_projects: false
```

Do not arbitrarily activate a project.

## H. Validate Setup

Verify:

- all required directories exist
- YAML is parseable
- agent files exist
- templates exist
- repository paths resolve
- no existing source code was accidentally modified
- Git repositories remain healthy

## I. Produce Setup Report

Create:

```text
SETUP-REPORT.md
```

Report:

- files created
- projects detected
- repositories detected
- unresolved mappings
- warnings
- recommended next step

---

# 55. Automation Philosophy

Do not build an overly complex orchestrator initially.

The first version should use:

```text
filesystem
+
Git
+
worktrees
+
Markdown
+
YAML
+
AI agents
```

Only introduce:

- databases
- queues
- event buses
- orchestration servers
- vector databases
- external workflow engines

when actual scale or reliability requirements justify them.

The workflow itself should follow the same infrastructure philosophy that Infra applies to projects:

> use the simplest system that reliably solves the current problem.

---

# 56. Future Extension Points

The design should allow later addition of:

- QA Agent
- Security Agent
- Database Agent
- Game Design Agent
- Art Agent
- Documentation Agent
- Automated PR creation
- CI integration
- GitHub/GitLab integration
- automated test execution
- issue tracker synchronization
- cost monitoring
- project dashboards
- agent performance statistics

Do not implement these during initial setup unless explicitly requested.

---

# 57. Non-Goals for Version 1

Do not build:

- autonomous production deployment
- autonomous database deletion
- autonomous approval of major architecture
- autonomous project switching
- unrestricted cross-project agents
- complicated agent voting systems
- agent personality simulations
- unnecessary persistent AI memory systems
- a custom workflow engine unless needed

Focus on reliable engineering workflow first.

---

# 58. Final Behavioral Contract

The entire system should behave approximately as follows:

```text
OWNER
  │
  │ "Build feature X"
  ▼
PROJECT MANAGER
  │
  ▼
ANALYST
  │
  ├─ requirements
  ├─ system design
  ├─ risks
  └─ task graph
  │
  ▼
PROJECT MANAGER
  │
  ├───────────┬────────────┬────────────┐
  ▼           ▼            ▼            ▼
UI/UX      BACKEND       INFRA       FRONTEND
  │           │             │            │
  └───────────┴──────┬──────┴────────────┘
                     │
                     ▼
                  REVIEW
                     │
                     ▼
                 VALIDATION
                     │
                     ▼
              PROJECT MANAGER
                     │
                     ▼
                   OWNER
```

The Owner specifies outcomes.

The Analyst determines what needs to happen.

The PM coordinates execution.

UI/UX defines the user experience.

Backend implements server-side behavior.

Frontend implements client-side behavior.

Infrastructure ensures the system is appropriately designed, transported, delivered, operated, and priced.

All important knowledge is persisted into the project workspace.

All coding work maps to explicit tasks.

All agents operate on one active project per session.

The system should optimize for:

```text
clarity
consistency
low unnecessary complexity
controlled parallelism
traceable decisions
cost awareness
safe execution
high-quality implementation
```

---

# 59. Instruction to the Desktop AI Agent

Execute this specification as an environment setup task.

Do not merely summarize it.

Create the required directory structure and files.

Preserve all existing repositories and user data.

Where existing configuration exists, integrate conservatively instead of replacing it blindly.

Do not modify application source code as part of the workspace setup.

After setup:

1. validate the workspace,
2. create `SETUP-REPORT.md`,
3. report any unresolved project mappings,
4. report any detected risks,
5. recommend which project should be initialized first, but do not activate or modify that project without instruction.

The resulting workspace must be understandable and usable by a new AI session solely from the files stored inside `project-centralized`.
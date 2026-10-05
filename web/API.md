# Dashboard API contract

`pcctl dashboard [--port 7777]` serves the UI and this API on **127.0.0.1 only**.

## Security

- The server binds `127.0.0.1` and rejects requests whose `Host` is not `127.0.0.1:<port>` or
  `localhost:<port>` (this blocks DNS rebinding) and whose remote address is not loopback.
- Every `/api/*` request must carry the per-process token: header `X-PC-Token: <token>`, or
  for `EventSource` the query parameter `?token=<token>`. The server injects the token into
  `index.html` as `<meta name="pc-token" content="...">`. In Vite dev mode the UI reads it
  from `GET /api/dev-token`, which works only when the server runs with `--dev`.
- Errors return `{ "error": "message" }` with a 4xx/5xx status.

All timestamps are RFC 3339 strings. All token counts are integers.

## Types

```ts
type TaskStatus = "backlog" | "ready" | "active" | "review" | "blocked" | "completed" | "cancelled";
type Role = "analyst" | "project-manager" | "uiux" | "frontend" | "backend" | "infra";

interface ProjectSummary {
  id: string; name: string; type: string; classification: string;
  repoPath: string; repoExists: boolean; remote: string;
  defaultBranch: string; workingBranch: string;
  active: boolean;                       // equals active-project.yaml
  health: string;                        // from STATUS.md "Health:" line, else "unknown"
  taskCounts: Record<TaskStatus, number>;
  weightDone: number; weightTotal: number;  // completed vs all non-cancelled weights
  git: { branch: string; dirty: number; ahead: number; behind: number } | null;
}

interface ProjectDetail extends ProjectSummary {
  projectMd: string; statusMd: string; currentReportMd: string;
  features: { id: string; title: string; status: string }[];
  decisions: { file: string; title: string; status: string }[];
}

interface Task {
  id: string; project: string; title: string; feature: string | null;
  status: TaskStatus; owner: Role | string; weight: number | null;
  priority: string; risk: string; description: string;
  requirements: string[]; acceptance_criteria: string[];
  dependencies: string[]; blocks: string[]; collaborators: string[]; reviewers: string[];
  notes: string[];
  git: { branch: string | null; commit: string | null };
  worktree: { required: boolean; path: string | null };
}

interface RoleInfo { id: Role; name: string; file: string; description: string }

type RunStatus = "running" | "succeeded" | "failed" | "stopped";
interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number }

interface Run {
  id: string; project: string; role: Role; taskId: string | null; prompt: string;
  status: RunStatus; permissionMode: "acceptEdits" | "bypassPermissions";
  budgetUsd: number; model: string | null;
  startedAt: string; endedAt: string | null;
  sessionId: string; pid: number | null;
  costUsd: number | null;        // from the final result event (exact)
  tokens: Tokens; numTurns: number;
  lastActivity: string; lastText: string;   // last assistant text or tool name, for bubbles
  error: string | null;
}

interface RunEvent {
  seq: number; ts: string;
  kind: "system" | "assistant_text" | "tool_use" | "tool_result" | "result" | "stderr";
  text: string; tool?: string;
}

type WorkerState = "working" | "blocked" | "review" | "waiting" | "idle";
interface Worker {
  role: Role; name: string; state: WorkerState;
  runId: string | null; taskId: string | null; taskTitle: string | null;
  bubble: string;                // short text: tool name, "TASK-012", "zz", "!"
  queued: number;                // ready tasks owned by this role
}
interface Office {
  project: string | null;        // null = HQ (no project selected / none registered)
  rooms: { project: string; name: string; active: boolean; workers: Worker[] }[];
  hq: Worker[];                  // roles with no project context (shown when rooms is empty)
  interactiveSessions: number;   // live interactive Claude Code sessions in the workspace
}

interface SessionInfo {
  id: string; project: string;   // "workspace" | project id
  cwd: string; source: "run" | "interactive"; runId: string | null;
  startedAt: string; lastActivity: string; live: boolean;   // log written in the last 2 min
  model: string; messages: number; tokens: Tokens; costUsd: number;
}

interface UsageRow { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number; messages: number }
interface Usage {
  from: string; to: string; pricingCheckedAt: string;
  totals: UsageRow;
  today: UsageRow;
  byDay: (UsageRow & { date: string })[];          // every day in range, zero-filled, ascending
  byModel: (UsageRow & { model: string })[];       // descending costUsd
  byProject: (UsageRow & { project: string })[];   // descending costUsd
  topSessions: SessionInfo[];                      // 20 most expensive in range
}

interface SystemSnapshot {
  t: string;
  cpu: { percent: number; perCore: number[]; cores: number; model: string };
  mem: { totalMB: number; usedMB: number; percent: number };
  processes: { pid: number; name: string; cpu: number; rssMB: number; kind: "claude" | "run"; runId: string | null; cmd: string }[];
  host: { os: string; hostname: string; uptimeSec: number };
}
interface SystemHistory { points: { t: string; cpu: number; mem: number }[] }   // last 15 min, 2 s step
```

## Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/overview` | | `{ workspace: {name, root}, activeProject: string\|null, projects: ProjectSummary[], runsActive: number, usageToday: UsageRow, system: SystemSnapshot }` |
| GET | `/api/projects` | | `ProjectSummary[]` |
| POST | `/api/projects` | `{id, name, type, classification, remote, defaultBranch?, workingBranch?, clone?: boolean}` | `ProjectSummary` (registers in workspace.yaml, scaffolds `projects/<id>/`, clones when `clone`) |
| GET | `/api/projects/{id}` | | `ProjectDetail` |
| POST | `/api/projects/{id}/activate` | | `ProjectSummary` |
| POST | `/api/projects/deactivate` | | `{ok: true}` |
| GET | `/api/projects/{id}/tasks` | | `Task[]` (sorted by id) |
| POST | `/api/projects/{id}/tasks` | `Partial<Task>` with required `title`, `owner` | `Task` (next sequential id) |
| PATCH | `/api/projects/{id}/tasks/{taskId}` | `Partial<Task>` and/or `{addNote: string}`; changing `status` moves the file | `Task` |
| GET | `/api/roles` | | `RoleInfo[]` |
| GET | `/api/office` | | `Office` |
| GET | `/api/runs` | | `Run[]` (newest first) |
| POST | `/api/runs` | `{project, role, prompt, taskId?, permissionMode, budgetUsd, model?}` | `Run` |
| POST | `/api/runs/{id}/stop` | | `Run` |
| GET | `/api/runs/{id}/events` | `?after=<seq>` | `RunEvent[]` |
| GET | `/api/sessions` | | `SessionInfo[]` (newest activity first, last 7 days) |
| GET | `/api/usage` | `?days=30` (1–365) | `Usage` |
| GET | `/api/system` | | `SystemSnapshot` |
| GET | `/api/system/history` | | `SystemHistory` |
| GET | `/api/events` | `?token=` (SSE) | event stream, below |

Starting a run with a `taskId` whose task is `backlog`/`ready` moves the task to `active`.

## Server-sent events (`/api/events`)

| `event:` | `data:` | When |
|---|---|---|
| `system` | `SystemSnapshot` | every 2 s |
| `runs` | `Run[]` | whenever any run changes |
| `run-event` | `{ runId: string, event: RunEvent }` | each new event of a running run |
| `workspace` | `{ changed: ("projects"\|"tasks"\|"active")[] }` | workspace files changed on disk |
| `office` | `Office` | whenever worker states change |
| `usage` | `{ today: UsageRow }` | after each usage rescan (every 30 s) |

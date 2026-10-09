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
  parentRunId: string | null;   // this run resumed parentRunId's session
  questionId: string | null;    // the owner question this run continues from
}

interface RunEvent {
  seq: number; ts: string;
  kind: "system" | "assistant_text" | "tool_use" | "tool_result" | "result" | "stderr";
  text: string; tool?: string;
}

type WorkerState = "working" | "asking" | "blocked" | "review" | "waiting" | "idle";
interface Worker {
  role: Role; name: string; state: WorkerState;
  runId: string | null; taskId: string | null; taskTitle: string | null;
  bubble: string;                // short text: tool name, "TASK-012", "zz", "!"
  queued: number;                // ready tasks owned by this role
  questionId: string | null;     // set when state = "asking"
  question: string | null;
}
interface Office {
  project: string | null;        // null = HQ (no project selected / none registered)
  rooms: { project: string; name: string; active: boolean; workers: Worker[] }[];
  hq: Worker[];                  // roles with no project context (shown when rooms is empty)
  interactiveSessions: number;   // live interactive Claude Code sessions in the workspace
  openQuestions: number;
}

interface Question {
  id: string; from: Role; project: string; task: string | null;
  runId: string | null; sessionId: string | null;
  question: string; context: string; options: string[];
  status: "open" | "answered" | "dismissed";
  answer: string | null; askedAt: string; answeredAt: string | null;
  resumedRun: string | null;
  source: "agent" | "auto";   // auto = detected from a run that ended on a question
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
| GET | `/api/kinds` | | `KindInfo[]` (software first) |
| GET | `/api/discussions` | | `DiscussionSummary[]` (latest activity first) |
| POST | `/api/discussions` | `{topic, project?, role?, budgetUsd?, model?, message?, override?}` | `{discussion: Discussion, run: Run \| null}` |
| GET | `/api/discussions/{id}` | | `Discussion` |
| POST | `/api/discussions/{id}/messages` | `{text, override?}` | `{discussion, run}` |
| POST | `/api/discussions/{id}/wrapup` | `{override?}` | `{discussion, run}` |
| POST | `/api/discussions/{id}/close` · `/reopen` | | `Discussion` |
| GET | `/api/prayer` | | `PrayerStatus` |
| GET | `/api/questions` | | `Question[]` (open first, newest first) |
| POST | `/api/questions/{id}/answer` | `{answer, resume?: boolean, override?: boolean}` | `{question: Question, run: Run \| null}` |
| POST | `/api/questions/{id}/dismiss` | | `Question` |
| GET | `/api/events` | `?token=` (SSE) | event stream, below |

Starting a run with a `taskId` whose task is `backlog`/`ready` moves the task to `active`.

### Project kinds

```ts
interface KindInfo {
  name: string;           // software | prototype | investigation | design | general | (custom)
  description: string;
  repo: "clone" | "local" | "none";   // default repo mode for the kind
  roles: Role[];          // roles involved by default
  deliverable: string;
  agentHint: string;
}
```

`POST /api/projects` takes `kind` (default software), an optional `type` label, and
`repo` (default from the kind). `remote` is required only when `repo` is `clone`, and
`clone: true` runs `pcctl init` for the project (clone or git init). `ProjectSummary`
adds `kind`, `repoMode` and `roles`; `repoExists` is always false for `repoMode: "none"`.
Office rooms add `kind` and `roles`: draw only the involved roles' desks for non-software
rooms (an investigation room is a small study, not six cubicles).

### Discussions (talk with the Analyst or any role)

```ts
interface DiscussionTurn { who: "owner" | "agent"; role: string; at: string; text: string;
                           runId: string | null; wrapup: boolean; error: boolean }
interface DiscussionSummary {
  id: string; topic: string; project: string | null;   // null = workspace-wide
  role: Role; sessionId: string | null; status: "open" | "closed"; budgetUsd: number;
  model: string | null; createdAt: string; updatedAt: string; costUsd: number;
  wrappedUp: boolean; path: string; turns: number; lastMessage: string;
  running: string | null;                               // run id while the role is answering
}
interface Discussion extends Omit<DiscussionSummary, "turns" | "lastMessage"> { turns: DiscussionTurn[] }
```

Each Owner message starts a plan-mode run that resumes the discussion's session; the
reply is appended when the run ends (the `runs`, `run-event` and `discussions` SSE events
carry progress). Sending while `running` is set returns 400. Sending during sholat returns
423 (override possible). Wrap-up asks for Summary, Ideas, Decisions, Next steps and Open
questions. Discussion runs carry `Run.discussionId`, and never create owner questions.
`Office.discussions: {id, role, project, topic, running}[]` lists live discussions:
that role's worker sits with the Owner in the Owner's room (talking pose while
`running`).

Worker state priority: working > asking > blocked > review > waiting > idle. An agent asks
the Owner by writing `runtime/agent-messages/owner/<id>.yaml` (the run's system prompt
explains the format) and ending its turn. If a run ends with a final paragraph that is a
question and filed nothing, an `auto` question is created. Answering with `resume: true`
starts a new run on the same Claude session (`--resume`), with the answer as the prompt.
Resuming is subject to the sholat launch hold, like any other launch.

During an active sholat window (`PrayerStatus.active` set and `config.holdLaunches`),
`POST /api/runs` returns **423 Locked** with `{error}` naming the prayer and the time the
hold ends. Send `override: true` in the body to launch anyway.

```ts
interface PrayerTime { name: "subuh" | "dzuhur" | "ashar" | "maghrib" | "isya"; at: string; hhmm: string }
interface PrayerStatus {
  config: { city: string; lat: number; lon: number; timezone: string; fajrAngle: number;
            ishaAngle: number; asrFactor: number; elevationM: number; ihtiyatMin: number;
            windowMin: number; holdLaunches: boolean; enabled: boolean };
  date: string;            // YYYY-MM-DD, local to config.timezone
  sunrise: string;         // HH:MM
  times: PrayerTime[];     // today's five prayers in order
  next: PrayerTime | null; // next adhan (tomorrow's subuh after isya)
  active: { name: string; startedAt: string; endsAt: string } | null;
}
```

Prayer times are computed offline (Kemenag RI parameters, configured under `prayer:` in
`workspace.yaml`; verified against Bimas Islam schedules for Malang).

## Server-sent events (`/api/events`)

| `event:` | `data:` | When |
|---|---|---|
| `system` | `SystemSnapshot` | every 2 s |
| `runs` | `Run[]` | whenever any run changes |
| `run-event` | `{ runId: string, event: RunEvent }` | each new event of a running run |
| `workspace` | `{ changed: ("projects"\|"tasks"\|"active")[] }` | workspace files changed on disk |
| `office` | `Office` | whenever worker states change |
| `usage` | `{ today: UsageRow }` | after each usage rescan (every 30 s) |
| `prayer` | `PrayerStatus` | on connect, and whenever a sholat window opens or closes |
| `questions` | `Question[]` | on connect, and whenever a question is filed, answered or dismissed |
| `discussions` | `DiscussionSummary[]` | on connect, and on every new message, reply, close or reopen |

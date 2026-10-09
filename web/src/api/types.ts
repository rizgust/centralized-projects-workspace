// Types mirror web/API.md exactly. Keep in sync with the Go server.

export type TaskStatus = "backlog" | "ready" | "active" | "review" | "blocked" | "completed" | "cancelled";
export type Role = "analyst" | "project-manager" | "uiux" | "frontend" | "backend" | "infra";

export interface GitInfo {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: string;
  classification: string;
  repoPath: string;
  repoExists: boolean;
  remote: string;
  defaultBranch: string;
  workingBranch: string;
  active: boolean;
  health: string;
  taskCounts: Record<TaskStatus, number>;
  weightDone: number;
  weightTotal: number;
  git: GitInfo | null;
  /** project kind (software | prototype | investigation | design | general | custom) */
  kind?: string;
  repoMode?: RepoMode;
  /** roles involved in this project */
  roles?: Role[];
}

export type RepoMode = "clone" | "local" | "none";
export interface KindInfo {
  name: string;
  description: string;
  repo: RepoMode;
  roles: Role[];
  deliverable: string;
  agentHint: string;
}

export interface ProjectDetail extends ProjectSummary {
  projectMd: string;
  statusMd: string;
  currentReportMd: string;
  features: { id: string; title: string; status: string }[];
  decisions: { file: string; title: string; status: string }[];
}

export interface Task {
  id: string;
  project: string;
  title: string;
  feature: string | null;
  status: TaskStatus;
  owner: Role | string;
  weight: number | null;
  priority: string;
  risk: string;
  description: string;
  requirements: string[];
  acceptance_criteria: string[];
  dependencies: string[];
  blocks: string[];
  collaborators: string[];
  reviewers: string[];
  notes: string[];
  git: { branch: string | null; commit: string | null };
  worktree: { required: boolean; path: string | null };
  /** the Analyst's original weight when the Owner adjusted it in review */
  proposedWeight?: number | null;
}

// ---- Owner workflow ----
export type Phase = "intake" | "brainstorm" | "planning" | "review" | "execution" | "done";
export const PHASES: Phase[] = ["intake", "brainstorm", "planning", "review", "execution", "done"];
export interface WorkflowLimits {
  maxParallel: number;
  dailyBudgetUsd: number;
  budgetPerWeight: number;
  maxTaskBudgetUsd: number;
  permissionMode: PermissionMode;
  pmBudgetUsd: number;
  analystBudgetUsd: number;
  model: string;
}
export interface WorkflowReports {
  milestones: boolean;
  dailyAt: string;
  everyHours: number;
  onDemand: boolean;
}
export interface Workflow {
  phase: Phase;
  delegation: "propose";
  limits: WorkflowLimits;
  reports: WorkflowReports;
  planApprovedAt: string | null;
  history: { phase: Phase; at: string; by: string; note?: string }[];
}
export interface DelegationItem {
  task: string;
  role: Role;
  budgetUsd: number;
  permissionMode: string;
  note: string;
  status: "proposed" | "queued" | "launched" | "done" | "failed" | "skipped";
  runId: string | null;
  detail: string;
}
export interface Delegation {
  id: string;
  createdAt: string;
  status: "proposed" | "approved" | "rejected" | "launched";
  reason: string;
  items: DelegationItem[];
  decidedAt: string | null;
  comment: string;
  path: string;
}
export interface ReportFile {
  file: string;
  type: "kickoff" | "milestone" | "daily" | "progress" | "on-demand" | "final" | "report";
  at: string;
  title: string;
  body?: string;
}
export interface WorkflowView {
  project: string;
  workflow: Workflow;
  plan: string | null;
  handover: string | null;
  tasks: number;
  totalWeight: number;
  weightByRole: Record<string, number>;
  adjusted: { task: string; title: string; from: number; to: number }[];
  notReady: { task: string; title: string; missing: string[] }[];
  delegations: Delegation[];
  spentToday: number;
  runningWork: number;
  pmBusy: boolean;
  lastReportAt: string | null;
  reports: ReportFile[];
}

export interface RoleInfo {
  id: Role;
  name: string;
  file: string;
  description: string;
}

export type RunStatus = "running" | "succeeded" | "failed" | "stopped";
export type PermissionMode = "acceptEdits" | "bypassPermissions";

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Run {
  id: string;
  project: string;
  role: Role;
  taskId: string | null;
  prompt: string;
  status: RunStatus;
  permissionMode: PermissionMode;
  budgetUsd: number;
  model: string | null;
  startedAt: string;
  endedAt: string | null;
  sessionId: string;
  pid: number | null;
  costUsd: number | null;
  tokens: Tokens;
  numTurns: number;
  lastActivity: string;
  lastText: string;
  error: string | null;
  /** this run resumed parentRunId's session */
  parentRunId?: string | null;
  /** the owner question this run continues from */
  questionId?: string | null;
  discussionId?: string | null;
  purpose?: "work" | "discussion" | "plan" | "revise" | "kickoff" | "delegate" | "report" | "arrange";
}

export type RunEventKind = "system" | "assistant_text" | "tool_use" | "tool_result" | "result" | "stderr";

export interface RunEvent {
  seq: number;
  ts: string;
  kind: RunEventKind;
  text: string;
  tool?: string;
}

export type WorkerState = "working" | "asking" | "proposing" | "blocked" | "review" | "waiting" | "idle";

export interface Worker {
  role: Role;
  name: string;
  state: WorkerState;
  runId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  bubble: string;
  queued: number;
  /** set when state = "asking" */
  questionId?: string | null;
  question?: string | null;
}

export interface OfficeRoom {
  project: string;
  name: string;
  active: boolean;
  workers: Worker[];
  kind?: string;
  roles?: Role[];
  phase?: Phase;
  pendingDelegations?: number;
}

export interface Office {
  project: string | null;
  rooms: OfficeRoom[];
  hq: Worker[];
  interactiveSessions: number;
  openQuestions?: number;
  discussions?: { id: string; role: Role; project: string | null; topic: string; running: string | null }[];
  /** The ONE workspace Analyst, seated in the Owner's office (never in rooms or hq). */
  analyst?: AnalystWorker;
}

export interface AnalystWorker extends Worker {
  /** project the state refers to */
  project: string | null;
  /** every project with demand on the Analyst */
  busy?: { project: string; state: WorkerState; bubble: string }[];
}

export interface DiscussionTurn {
  who: "owner" | "agent";
  role: string;
  at: string;
  text: string;
  runId: string | null;
  wrapup: boolean;
  error: boolean;
}
export interface DiscussionSummary {
  id: string;
  topic: string;
  project: string | null;
  role: Role;
  sessionId: string | null;
  status: "open" | "closed";
  budgetUsd: number;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  costUsd: number;
  wrappedUp: boolean;
  path: string;
  turns: number;
  lastMessage: string;
  running: string | null;
}
export interface Discussion extends Omit<DiscussionSummary, "turns" | "lastMessage"> {
  turns: DiscussionTurn[];
}
export interface NewDiscussionBody {
  topic: string;
  project?: string | null;
  role?: Role;
  budgetUsd?: number;
  model?: string;
  message?: string;
  override?: boolean;
}

export interface Question {
  id: string;
  from: Role;
  project: string;
  task: string | null;
  runId: string | null;
  sessionId: string | null;
  question: string;
  context: string;
  options: string[];
  status: "open" | "answered" | "dismissed";
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
  resumedRun: string | null;
  source: "agent" | "auto";
}

export interface SessionInfo {
  id: string;
  project: string;
  cwd: string;
  source: "run" | "interactive";
  runId: string | null;
  startedAt: string;
  lastActivity: string;
  live: boolean;
  model: string;
  messages: number;
  tokens: Tokens;
  costUsd: number;
}

export interface UsageRow {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  messages: number;
}

export interface Usage {
  from: string;
  to: string;
  pricingCheckedAt: string;
  totals: UsageRow;
  today: UsageRow;
  byDay: (UsageRow & { date: string })[];
  byModel: (UsageRow & { model: string })[];
  byProject: (UsageRow & { project: string })[];
  topSessions: SessionInfo[];
}

export interface SystemProcess {
  pid: number;
  name: string;
  cpu: number;
  rssMB: number;
  kind: "claude" | "run";
  runId: string | null;
  cmd: string;
}

export interface SystemSnapshot {
  t: string;
  cpu: { percent: number; perCore: number[]; cores: number; model: string };
  mem: { totalMB: number; usedMB: number; percent: number };
  processes: SystemProcess[];
  host: { os: string; hostname: string; uptimeSec: number };
}

export interface SystemPoint {
  t: string;
  cpu: number;
  mem: number;
}

export interface SystemHistory {
  points: SystemPoint[];
}

export interface Overview {
  workspace: { name: string; root: string };
  activeProject: string | null;
  projects: ProjectSummary[];
  runsActive: number;
  usageToday: UsageRow;
  system: SystemSnapshot;
}

// ---- request bodies ----

export interface RegisterProjectBody {
  id: string;
  name: string;
  type: string;
  classification: string;
  remote: string;
  defaultBranch?: string;
  workingBranch?: string;
  clone?: boolean;
  kind?: string;
  repo?: RepoMode;
}

export type CreateTaskBody = Partial<Task> & { title: string; owner: Role | string };
export type PatchTaskBody = Partial<Task> & { addNote?: string };

export interface StartRunBody {
  project: string;
  role: Role;
  prompt: string;
  taskId?: string;
  permissionMode: PermissionMode;
  budgetUsd: number;
  model?: string;
  /** launch during an active sholat window (otherwise the server answers 423) */
  override?: boolean;
}

// ---- prayer (sholat) ----

export type PrayerName = "subuh" | "dzuhur" | "ashar" | "maghrib" | "isya";
export interface PrayerTime {
  name: PrayerName;
  at: string;
  hhmm: string;
}
export interface PrayerStatus {
  config: {
    city: string;
    lat: number;
    lon: number;
    timezone: string;
    fajrAngle: number;
    ishaAngle: number;
    asrFactor: number;
    elevationM: number;
    ihtiyatMin: number;
    windowMin: number;
    holdLaunches: boolean;
    enabled: boolean;
  };
  date: string;
  sunrise: string;
  times: PrayerTime[];
  next: PrayerTime | null;
  active: { name: string; startedAt: string; endsAt: string } | null;
}

// ---- SSE ----

export interface SseEventMap {
  system: SystemSnapshot;
  runs: Run[];
  "run-event": { runId: string; event: RunEvent };
  workspace: { changed: ("projects" | "tasks" | "active")[] };
  office: Office;
  usage: { today: UsageRow };
  prayer: PrayerStatus;
  questions: Question[];
  discussions: DiscussionSummary[];
  workflow: { project: string };
}

export type SseEventName = keyof SseEventMap;

export const TASK_STATUSES: TaskStatus[] = ["backlog", "ready", "active", "review", "blocked", "completed", "cancelled"];
export const ROLES: Role[] = ["analyst", "project-manager", "uiux", "frontend", "backend", "infra"];

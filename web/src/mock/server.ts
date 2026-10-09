// In-memory mock of the dashboard API + simulated SSE. Loaded only in mock mode
// (dynamic import from api/client.ts), so it stays out of the main bundle.
import { ApiError, type ConnStatus, type SseHandler } from "../api/client";
import type {
  Office,
  OfficeRoom,
  PrayerName,
  PrayerStatus,
  Question,
  Discussion,
  DiscussionSummary,
  DiscussionTurn,
  NewDiscussionBody,
  Role as RoleT,
  Overview,
  ProjectDetail,
  ProjectSummary,
  RegisterProjectBody,
  Role,
  Run,
  RunEvent,
  SessionInfo,
  SseEventMap,
  SseEventName,
  StartRunBody,
  SystemPoint,
  SystemSnapshot,
  Task,
  TaskStatus,
  Usage,
  UsageRow,
  Worker,
  WorkerState,
} from "../api/types";
import { ROLES, TASK_STATUSES } from "../api/types";
import {
  MODELS,
  PROJECTS,
  PROJECT_SHARE,
  ROLE_INFO,
  KINDS,
  RUN_SCRIPT,
  costOf,
  iso,
  seedRuns,
  seedSessions,
  seedTasks,
  seedUsage,
  type ProjectSeed,
} from "./fixtures";

const now = () => Date.now();
const START = now();

// ------------------------------------------------------------------ state
const db = {
  projects: PROJECTS.map((p) => ({ ...p })) as ProjectSeed[],
  active: "atlas-web" as string | null,
  tasks: seedTasks(),
  runs: seedRuns(START),
  events: new Map<string, RunEvent[]>(),
  scriptPos: new Map<string, number>(),
  sessions: seedSessions(START),
  usage: seedUsage(START),
  todayExtra: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, messages: 0 } as UsageRow,
  cpu: 34,
  history: [] as SystemPoint[],
  interactive: 1,
  overrides: new Map<string, { state: WorkerState; bubble: string; until: number }>(),
};

// `?mock=1&empty=1` starts with a fresh workspace (no projects) to demo the HQ state.
if (new URLSearchParams(window.location.search).get("empty") === "1") {
  db.projects = [];
  db.active = null;
  db.tasks = [];
  db.runs = [];
  db.sessions = db.sessions.filter((s) => s.project === "workspace");
}

// ------------------------------------------------------------------ owner questions
const questions: Question[] = [
  {
    id: "q-01",
    from: "uiux",
    project: "atlas-web",
    task: "TASK-012",
    runId: "run-5b21",
    sessionId: "c0ffee02-5b21",
    question: "Should the Pro upgrade flow open as a full page or a modal sheet?",
    context: "TASK-012 Pro plan upgrade flow. A full page gives room for the plan comparison; a modal keeps users in their current workspace. Both mockups are in the Figma file.",
    options: ["Full page", "Modal sheet", "Modal on mobile, page on desktop"],
    status: "open",
    answer: null,
    askedAt: iso(START - 18 * 60_000),
    answeredAt: null,
    resumedRun: null,
    source: "agent",
  },
  {
    id: "q-02",
    from: "backend",
    project: "pixel-quest",
    task: "TASK-006",
    runId: "run-3c09",
    sessionId: "c0ffee03-3c09",
    question: "Is it OK to add a dependency for A* pathfinding, or should I hand-roll it?",
    context: "The run ended on this question: \"I can pull in a small A* library (MIT, ~8 KB) or write a hex-grid A* myself. Which do you prefer?\"",
    options: [],
    status: "open",
    answer: null,
    askedAt: iso(START - 6 * 60_000),
    answeredAt: null,
    resumedRun: null,
    source: "auto",
  },
];
const emitQuestions = () => emit("questions", structuredClone(questions));

// ------------------------------------------------------------------ discussions
const MINUTE = 60_000;
const NL = "\n";
const modeOf = (req: RegisterProjectBody) => req.repo || KINDS.find((k) => k.name === (req.kind || "software"))?.repo || "clone";
const turn = (who: "owner" | "agent", ago: number, text: string, wrapup = false): DiscussionTurn => ({
  who,
  role: who === "owner" ? "owner" : "analyst",
  at: iso(START - ago * MINUTE),
  text,
  runId: null,
  wrapup,
  error: false,
});
const discussions: Discussion[] = [
  {
    id: "d-01",
    topic: "Integration ideas across our projects",
    project: null,
    role: "analyst",
    sessionId: "d0c5-0001",
    status: "open",
    budgetUsd: 1,
    model: null,
    createdAt: iso(START - 40 * MINUTE),
    updatedAt: iso(START - 3 * MINUTE),
    costUsd: 0.62,
    wrappedUp: false,
    path: "runtime/discussions/d-01.yaml",
    running: null,
    turns: [
      turn("owner", 40, "Could Atlas Web and Pixel Quest share anything? Accounts, payments, analytics?"),
      turn(
        "agent",
        38,
        [
          "Three realistic overlaps:",
          "",
          "1. **Accounts**: both need sign-in. A shared auth service would let one login work in the web app and the game launcher.",
          "2. **Payments**: Vendor Research is already comparing providers; Atlas Web's Pro plan and Pixel Quest's cosmetics could use the same checkout.",
          "3. **Usage analytics**: the credit counter in Atlas Web (TASK-006) is really a generic event counter.",
          "",
          "Of these, *payments* has the best effort-to-value ratio right now.",
        ].join(NL),
      ),
      turn("owner", 6, "Go deeper on payments. What would sharing it cost us?"),
      turn(
        "agent",
        3,
        [
          "Rough sizing, assuming one provider for both:",
          "",
          "| Piece | Effort |",
          "|---|---|",
          "| Provider SDK wrapper (Go) | 2-3 days |",
          "| Webhook receiver + ledger | 3 days |",
          "| Atlas Web checkout UI | 2 days |",
          "| Pixel Quest store hook | 2 days |",
          "",
          "The risk is IDR payouts: only two of the three shortlisted providers settle daily.",
        ].join(NL),
      ),
    ],
  },
  {
    id: "d-02",
    topic: "Receipt OCR vendor options",
    project: "atlas-web",
    role: "analyst",
    sessionId: "d0c5-0002",
    status: "closed",
    budgetUsd: 1,
    model: null,
    createdAt: iso(START - 2 * 24 * 60 * MINUTE),
    updatedAt: iso(START - 47 * 60 * MINUTE),
    costUsd: 0.91,
    wrappedUp: true,
    path: "projects/atlas-web/discussions/d-02.md",
    running: null,
    turns: [
      turn("owner", 2900, "Which OCR option should receipt parsing use?"),
      turn("agent", 2895, "A hosted OCR model is cheapest to start; on-device parsing only pays off above roughly 50k receipts a month."),
      turn("owner", 2840, "OK, wrap this up."),
      turn(
        "agent",
        2830,
        [
          "## Summary",
          "Start with a hosted OCR model behind a small adapter so it can be swapped later.",
          "",
          "## Ideas",
          "- Cache parsed receipts by image hash",
          "- Let users correct fields; feed corrections back as eval data",
          "",
          "## Decisions",
          "- Hosted OCR for v1 (ADR-003 to be accepted)",
          "",
          "## Next steps",
          "- [backend] Add an OCR adapter interface with one hosted implementation (atlas-web)",
          "- [frontend] Build the receipt field correction form (atlas-web)",
          "- [analyst] Collect 50 real receipts as an evaluation set (atlas-web)",
          "",
          "## Open questions",
          "- What accuracy is good enough to skip manual review?",
        ].join(NL),
        true,
      ),
    ],
  },
];
const summaryOf = (d: Discussion): DiscussionSummary => {
  const { turns, ...rest } = d;
  return { ...rest, turns: turns.length, lastMessage: turns[turns.length - 1]?.text.slice(0, 140) ?? "" };
};
const emitDiscussions = () => emit("discussions", discussions.map(summaryOf).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)));

const CANNED = [
  [
    "Good question. Looking across the workspace:",
    "",
    "- **Atlas Web** already has a credit counter we could generalise",
    "- **Vendor Research** has the provider shortlist",
    "",
    "I'd start with a one-page integration brief so the PM can split it into tasks.",
  ].join(NL),
  [
    "Here's how I'd sequence it:",
    "",
    "1. Agree the shared contract (events + webhooks)",
    "2. Build the Go wrapper behind an interface",
    "3. Wire Atlas Web first, Pixel Quest second",
    "",
    "> Risk: payouts in IDR. Confirm settlement times before committing.",
  ].join(NL),
];
const WRAPUP = [
  "## Summary",
  "Share one payment provider across Atlas Web and Pixel Quest through a small Go wrapper; pick the provider once Vendor Research finishes.",
  "",
  "## Ideas",
  "- Shared auth later, after payments land",
  "- Reuse the credit counter as a generic usage meter",
  "",
  "## Decisions",
  "- Payments first; accounts and analytics deferred",
  "",
  "## Next steps",
  "- [analyst] Write the payments integration brief (vendor-research)",
  "- [backend] Prototype the provider SDK wrapper with webhooks (atlas-web)",
  "- [project-manager] Plan the checkout milestone (atlas-web)",
  "",
  "## Open questions",
  "- Which provider settles IDR daily at our volume?",
].join(NL);

function discussionReply(d: Discussion, text: string, wrapup: boolean): Run {
  const id = `run-dc${Math.random().toString(16).slice(2, 6)}`;
  const run: Run = {
    id,
    project: d.project ?? "workspace",
    role: d.role,
    taskId: null,
    prompt: text,
    status: "running",
    permissionMode: "acceptEdits",
    budgetUsd: d.budgetUsd,
    model: d.model,
    startedAt: iso(now()),
    endedAt: null,
    sessionId: d.sessionId ?? crypto.randomUUID(),
    pid: 40000 + Math.floor(Math.random() * 9000),
    costUsd: null,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    numTurns: 0,
    lastActivity: iso(now()),
    lastText: "Thinking",
    error: null,
    discussionId: d.id,
  };
  db.events.set(id, []);
  d.running = id;
  const steps: [number, string, string][] = [
    [500, "Read", "templates/kinds/investigation.md"],
    [1500, "Read", "projects/vendor-research/STATUS.md"],
    [2700, "Grep", 'pattern: "payment" path: projects/'],
  ];
  for (const [ms, tool, arg] of steps)
    setTimeout(() => {
      const list = db.events.get(id) ?? [];
      const ev: RunEvent = { seq: list.length + 1, ts: iso(now()), kind: "tool_use", tool, text: arg };
      list.push(ev);
      db.events.set(id, list);
      emit("run-event", { runId: id, event: ev });
    }, ms);
  setTimeout(() => {
    const n = d.turns.filter((t) => t.who === "agent").length;
    d.turns.push({ who: "agent", role: d.role, at: iso(now()), text: wrapup ? WRAPUP : CANNED[n % CANNED.length], runId: id, wrapup, error: false });
    d.running = null;
    d.costUsd = Math.round((d.costUsd + 0.17) * 100) / 100;
    d.updatedAt = iso(now());
    if (wrapup) d.wrappedUp = true;
    emitDiscussions();
    emitOffice();
  }, 4200);
  return run;
}

function discussionRoute(method: string, id: string | undefined, action: string | undefined, B: Record<string, unknown>): unknown {
  if (method === "GET" && !id) return discussions.map(summaryOf).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  const hold = (override: unknown) => {
    if (prayerState.active && !override) {
      const n = prayerState.active.name;
      throw new ApiError(`Sholat ${n.charAt(0).toUpperCase() + n.slice(1)} in progress; messages are held until ${hhmm(Date.parse(prayerState.active.endsAt))}`, 423);
    }
  };
  if (method === "POST" && !id) {
    const req = B as unknown as NewDiscussionBody;
    if (!req.topic?.trim()) throw new ApiError("topic is required", 400);
    if (req.message?.trim()) hold(req.override);
    const n = discussions.length + 1;
    const d: Discussion = {
      id: `d-${String(n).padStart(2, "0")}`,
      topic: req.topic.trim(),
      project: req.project ?? null,
      role: req.role ?? "analyst",
      sessionId: null,
      status: "open",
      budgetUsd: req.budgetUsd ?? 1,
      model: req.model ?? null,
      createdAt: iso(now()),
      updatedAt: iso(now()),
      costUsd: 0,
      wrappedUp: false,
      path: `runtime/discussions/d-${n}.yaml`,
      running: null,
      turns: [],
    };
    discussions.unshift(d);
    let run: Run | null = null;
    if (req.message?.trim()) {
      d.turns.push({ who: "owner", role: "owner", at: iso(now()), text: req.message.trim(), runId: null, wrapup: false, error: false });
      run = discussionReply(d, req.message, false);
    }
    emitDiscussions();
    emitOffice();
    return { discussion: d, run };
  }
  const d = discussions.find((x) => x.id === id);
  if (!d) throw new ApiError(`discussion ${id} not found`, 404);
  if (method === "GET" && !action) return d;
  if (method === "POST" && (action === "close" || action === "reopen")) {
    d.status = action === "close" ? "closed" : "open";
    d.updatedAt = iso(now());
    emitDiscussions();
    emitOffice();
    return d;
  }
  if (method === "POST" && (action === "messages" || action === "wrapup")) {
    if (d.running) throw new ApiError("the agent is still answering", 400);
    hold(B.override);
    const text = action === "wrapup" ? "Please wrap up this discussion." : String(B.text ?? "").trim();
    if (!text) throw new ApiError("text is required", 400);
    if (d.status === "closed") d.status = "open";
    d.turns.push({ who: "owner", role: "owner", at: iso(now()), text, runId: null, wrapup: false, error: false });
    d.updatedAt = iso(now());
    const run = discussionReply(d, text, action === "wrapup");
    emitDiscussions();
    emitOffice();
    return { discussion: d, run };
  }
  throw new ApiError(`mock: no discussion route ${method} ${action}`, 404);
}

// ------------------------------------------------------------------ prayer fixture
// Times are relative to "now": the next adhan is ~4 minutes away. `?sholat=now` opens a
// window immediately for demos.
const WINDOW_MIN = 20;
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const prayerTimes = (() => {
  const MIN = 60_000;
  const base = START + 4 * MIN;
  const offs: [PrayerName, number][] = [
    ["subuh", -9 * 60],
    ["dzuhur", -3 * 60],
    ["ashar", 0],
    ["maghrib", 2 * 60 + 40],
    ["isya", 3 * 60 + 55],
  ];
  return offs.map(([name, m]) => ({ name, at: iso(base + m * MIN), hhmm: hhmm(base + m * MIN) }));
})();
const prayerState = {
  active: null as PrayerStatus["active"],
};
{
  const q = new URLSearchParams(window.location.search);
  // ?sholat=now opens a window immediately; &sholatAgo=SECONDS starts it that long ago
  if (q.get("sholat") === "now") {
    const ago = Number(q.get("sholatAgo") ?? 0) * 1000;
    prayerState.active = { name: "ashar", startedAt: iso(START - ago), endsAt: iso(START - ago + WINDOW_MIN * 60_000) };
  }
}
function prayer(): PrayerStatus {
  const t = now();
  const next = prayerTimes.find((p) => Date.parse(p.at) > t) ?? null;
  return {
    config: {
      city: "Malang",
      lat: -7.9666,
      lon: 112.6326,
      timezone: "Asia/Jakarta",
      fajrAngle: 20,
      ishaAngle: 18,
      asrFactor: 1,
      elevationM: 440,
      ihtiyatMin: 2,
      windowMin: WINDOW_MIN,
      holdLaunches: true,
      enabled: true,
    },
    date: new Date().toISOString().slice(0, 10),
    sunrise: hhmm(Date.parse(prayerTimes[0].at) + 78 * 60_000),
    times: prayerTimes,
    next,
    active: prayerState.active,
  };
}

// Pre-fill events for every seeded run.
for (const run of db.runs) {
  const evs: RunEvent[] = [];
  const t0 = Date.parse(run.startedAt);
  evs.push({ seq: 1, ts: run.startedAt, kind: "system", text: `session ${run.sessionId} · cwd repos/${run.project} · mode ${run.permissionMode}` });
  const n = run.status === "running" ? 9 : RUN_SCRIPT.length;
  for (let i = 0; i < n; i++) {
    const s = RUN_SCRIPT[i];
    evs.push({ seq: evs.length + 1, ts: iso(t0 + (i + 1) * 20_000), kind: s.kind, text: s.text, tool: s.tool });
  }
  if (run.status === "failed") evs.push({ seq: evs.length + 1, ts: run.endedAt!, kind: "stderr", text: run.error ?? "failed" });
  if (run.status !== "running")
    evs.push({ seq: evs.length + 1, ts: run.endedAt!, kind: "result", text: `${run.status} · ${run.numTurns} turns · $${(run.costUsd ?? 0).toFixed(2)}` });
  db.events.set(run.id, evs);
  db.scriptPos.set(run.id, n);
}

// 15 minutes of system history at 2 s steps.
{
  let c = 30;
  for (let i = 449; i >= 0; i--) {
    c = Math.max(4, Math.min(96, c + (Math.random() - 0.5) * 9 + (32 - c) * 0.05));
    db.history.push({ t: iso(START - i * 2000), cpu: round1(c), mem: round1(61 + Math.sin(i / 40) * 4 + Math.random()) });
  }
  db.cpu = c;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ------------------------------------------------------------------ derived views
function rolesOf(p: ProjectSeed): RoleT[] {
  return KINDS.find((k) => k.name === p.kind)?.roles ?? ROLES;
}

function summary(p: ProjectSeed): ProjectSummary {
  const tasks = db.tasks.filter((t) => t.project === p.id);
  const taskCounts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
  let weightDone = 0;
  let weightTotal = 0;
  for (const t of tasks) {
    taskCounts[t.status]++;
    if (t.status !== "cancelled") weightTotal += t.weight ?? 0;
    if (t.status === "completed") weightDone += t.weight ?? 0;
  }
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    classification: p.classification,
    repoPath: `repos/${p.id}`,
    repoExists: p.repoExists,
    remote: p.remote,
    defaultBranch: p.defaultBranch,
    workingBranch: p.workingBranch,
    active: db.active === p.id,
    health: p.health,
    taskCounts,
    weightDone,
    weightTotal,
    git: p.git,
    kind: p.kind,
    repoMode: p.repoMode,
    roles: rolesOf(p),
  };
}

function detail(p: ProjectSeed): ProjectDetail {
  return { ...summary(p), projectMd: p.projectMd, statusMd: p.statusMd, currentReportMd: p.currentReportMd, features: p.features, decisions: p.decisions };
}

const roleName = (r: Role) => ROLE_INFO.find((x) => x.id === r)?.name ?? r;

function workerFor(project: string | null, role: Role): Worker {
  const base: Worker = { role, name: roleName(role), state: "idle", runId: null, taskId: null, taskTitle: null, bubble: "zz", queued: 0 };
  if (!project) return base;
  const tasks = db.tasks.filter((t) => t.project === project && t.owner === role);
  base.queued = tasks.filter((t) => t.status === "ready").length;
  const run = db.runs.find((r) => r.project === project && r.role === role && r.status === "running");
  const pick = (s: TaskStatus) => tasks.find((t) => t.status === s);
  const ov = db.overrides.get(`${project}/${role}`);
  if (run) {
    const task = run.taskId ? db.tasks.find((t) => t.project === project && t.id === run.taskId) : undefined;
    return { ...base, state: "working", runId: run.id, taskId: run.taskId, taskTitle: task?.title ?? null, bubble: run.lastText.slice(0, 12) };
  }
  const q = questions.find((x) => x.status === "open" && x.project === project && x.from === role);
  if (q) return { ...base, state: "asking", questionId: q.id, question: q.question, taskId: q.task, taskTitle: db.tasks.find((t) => t.project === project && t.id === q.task)?.title ?? null, bubble: "?" };
  if (ov && ov.until > now()) {
    const t = pick("active") ?? pick("ready") ?? tasks[0];
    return { ...base, state: ov.state, bubble: ov.bubble, taskId: t?.id ?? null, taskTitle: t?.title ?? null };
  }
  const blocked = pick("blocked");
  if (blocked) return { ...base, state: "blocked", taskId: blocked.id, taskTitle: blocked.title, bubble: "!" };
  const review = pick("review");
  if (review) return { ...base, state: "review", taskId: review.id, taskTitle: review.title, bubble: review.id };
  const ready = pick("ready");
  if (ready) return { ...base, state: "waiting", taskId: ready.id, taskTitle: ready.title, bubble: ready.id };
  return base;
}

function office(): Office {
  const rooms: OfficeRoom[] = db.projects.map((p) => ({
    project: p.id,
    name: p.name,
    active: db.active === p.id,
    kind: p.kind,
    roles: rolesOf(p),
    workers: rolesOf(p).map((r) => workerFor(p.id, r)),
  }));
  return { project: db.active, rooms, hq: ROLES.map((r) => workerFor(null, r)), interactiveSessions: db.interactive, openQuestions: questions.filter((q) => q.status === "open").length, discussions: discussions.filter((d) => d.status === "open").map((d) => ({ id: d.id, role: d.role, project: d.project, topic: d.topic, running: d.running })) };
}

function addRow(a: UsageRow, b: UsageRow): UsageRow {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
    messages: a.messages + b.messages,
  };
}
const zeroRow = (): UsageRow => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, messages: 0 });
const scaleRow = (a: UsageRow, k: number): UsageRow => ({
  input: Math.round(a.input * k),
  output: Math.round(a.output * k),
  cacheRead: Math.round(a.cacheRead * k),
  cacheWrite: Math.round(a.cacheWrite * k),
  costUsd: a.costUsd * k,
  messages: Math.round(a.messages * k),
});

function todayRow(): UsageRow {
  const today = new Date().toISOString().slice(0, 10);
  return addRow(
    db.usage.filter((u) => u.date === today).reduce((a, u) => addRow(a, u.row), zeroRow()),
    db.todayExtra,
  );
}

function usage(days: number): Usage {
  days = Math.max(1, Math.min(90, days));
  const dates = [...new Set(db.usage.map((u) => u.date))].slice(-days);
  const today = dates[dates.length - 1];
  const inRange = db.usage.filter((u) => dates.includes(u.date));
  const byDay = dates.map((date) => {
    let row = inRange.filter((u) => u.date === date).reduce((a, u) => addRow(a, u.row), zeroRow());
    if (date === today) row = addRow(row, db.todayExtra);
    return { ...row, date };
  });
  const totals = byDay.reduce((a, d) => addRow(a, d), zeroRow());
  const byModel = MODELS.map((model) => ({
    ...inRange.filter((u) => u.model === model).reduce((a, u) => addRow(a, u.row), zeroRow()),
    model,
  })).sort((a, b) => b.costUsd - a.costUsd);
  const byProject = PROJECT_SHARE.map(([project, k]) => ({ ...scaleRow(totals, k), project })).sort((a, b) => b.costUsd - a.costUsd);
  const from = dates[0];
  const topSessions = [...db.sessions]
    .filter((s) => s.lastActivity.slice(0, 10) >= from)
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 20);
  return { from, to: today, pricingCheckedAt: "2026-09-30", totals, today: todayRow(), byDay, byModel, byProject, topSessions };
}

function system(): SystemSnapshot {
  const cores = 8;
  const perCore = Array.from({ length: cores }, (_, i) =>
    round1(Math.max(1, Math.min(100, db.cpu + (Math.sin(now() / 3000 + i * 1.7) * 22 + (Math.random() - 0.5) * 18)))),
  );
  const memPct = db.history[db.history.length - 1]?.mem ?? 62;
  const running = db.runs.filter((r) => r.status === "running");
  return {
    t: iso(now()),
    cpu: { percent: round1(db.cpu), perCore, cores, model: "AMD Ryzen 7 5800H with Radeon Graphics" },
    mem: { totalMB: 16_096, usedMB: Math.round((16_096 * memPct) / 100), percent: memPct },
    processes: [
      { pid: 18220, name: "claude.exe", cpu: round1(1 + Math.random() * 4), rssMB: 412, kind: "claude", runId: null, cmd: "claude" },
      ...running.map((r) => ({
        pid: r.pid ?? 0,
        name: "claude.exe",
        cpu: round1(6 + Math.random() * 14),
        rssMB: 380 + Math.round(Math.random() * 60),
        kind: "run" as const,
        runId: r.id,
        cmd: `claude -p --output-format stream-json --permission-mode ${r.permissionMode}`,
      })),
      { pid: 9932, name: "claude.exe", cpu: round1(Math.random() * 2), rssMB: 298, kind: "claude", runId: null, cmd: "claude --resume" },
    ],
    host: { os: "windows 11 (10.0.26200)", hostname: "RIZGUST-LAPTOP", uptimeSec: 3 * 86_400 + 7 * 3600 + Math.round((now() - START) / 1000) },
  };
}

function overview(): Overview {
  return {
    workspace: { name: "project-centralized", root: "C:\\Users\\rizgust\\Projects-Centralized" },
    activeProject: db.active,
    projects: db.projects.map(summary),
    runsActive: db.runs.filter((r) => r.status === "running").length,
    usageToday: todayRow(),
    system: system(),
  };
}

// ------------------------------------------------------------------ events bus
const listeners = new Set<SseHandler>();
function emit<K extends SseEventName>(name: K, data: SseEventMap[K]) {
  for (const l of listeners) l(name, data);
}
const emitRuns = () => emit("runs", db.runs.map((r) => ({ ...r })));
const emitOffice = () => emit("office", office());

function pushEvent(run: Run, ev: Omit<RunEvent, "seq" | "ts">) {
  const list = db.events.get(run.id) ?? [];
  const full: RunEvent = { ...ev, seq: list.length + 1, ts: iso(now()) };
  list.push(full);
  db.events.set(run.id, list);
  emit("run-event", { runId: run.id, event: full });
}

function finishRun(run: Run, status: Run["status"], error: string | null = null) {
  run.status = status;
  run.endedAt = iso(now());
  run.error = error;
  run.pid = null;
  run.costUsd = Math.round(costOf(run.model ?? "claude-sonnet-4-5", run.tokens) * 100) / 100;
  pushEvent(run, { kind: "result", text: `${status} · ${run.numTurns} turns · $${run.costUsd.toFixed(2)}` });
  const s = db.sessions.find((x) => x.runId === run.id);
  if (s) s.live = false;
  emitRuns();
  emitOffice();
}

let simStarted = false;
function startSimulation() {
  if (simStarted) return;
  simStarted = true;

  // CPU + system every 2 s.
  setInterval(() => {
    const running = db.runs.filter((r) => r.status === "running").length;
    const target = 22 + running * 14;
    db.cpu = Math.max(3, Math.min(98, db.cpu + (Math.random() - 0.5) * 14 + (target - db.cpu) * 0.12 + (Math.random() < 0.06 ? 30 : 0)));
    const snap = system();
    const mem = round1(Math.max(40, Math.min(92, (db.history[db.history.length - 1]?.mem ?? 62) + (Math.random() - 0.5) * 1.6)));
    db.history.push({ t: snap.t, cpu: snap.cpu.percent, mem });
    if (db.history.length > 450) db.history.shift();
    emit("system", system());
  }, 2000);

  // Running runs emit events every ~1.6 s.
  setInterval(() => {
    for (const run of db.runs) {
      if (run.status !== "running") continue;
      const pos = db.scriptPos.get(run.id) ?? 0;
      const step = RUN_SCRIPT[pos % RUN_SCRIPT.length];
      db.scriptPos.set(run.id, pos + 1);
      pushEvent(run, step);
      if (step.kind === "tool_use") run.lastText = step.tool ?? "tool";
      else if (step.kind === "assistant_text") {
        run.lastText = "Thinking";
        run.numTurns++;
      }
      run.tokens.input += 400 + Math.round(Math.random() * 900);
      run.tokens.output += 150 + Math.round(Math.random() * 500);
      run.tokens.cacheRead += 20_000 + Math.round(Math.random() * 15_000);
      run.tokens.cacheWrite += Math.round(Math.random() * 2500);
      run.lastActivity = iso(now());
      // Launched-from-UI runs finish after ~14 events; the seeded one keeps going.
      if (run.id.startsWith("run-ui") && pos >= 14) finishRun(run, Math.random() < 0.8 ? "succeeded" : "failed", null);
      if (run.costUsd === null && costOf(run.model ?? "claude-sonnet-4-5", run.tokens) > run.budgetUsd * 5) {
        // keep the demo run alive: trim tokens rather than hitting the budget
        run.tokens.cacheRead = Math.round(run.tokens.cacheRead * 0.5);
      }
    }
    emitRuns();
    emitOffice();
  }, 1600);

  // Workers wander between states so the office feels alive.
  setInterval(() => {
    const p = db.projects[Math.floor(Math.random() * db.projects.length)];
    if (!p) return;
    const role = ROLES[Math.floor(Math.random() * ROLES.length)];
    const states: [WorkerState, string][] = [
      ["working", ["Read", "Grep", "Edit", "Bash", "Write", "WebSearch"][Math.floor(Math.random() * 6)]],
      ["review", "?"],
      ["idle", "zz"],
      ["waiting", "TASK"],
    ];
    const [state, bubble] = states[Math.floor(Math.random() * states.length)];
    db.overrides.set(`${p.id}/${role}`, { state, bubble, until: now() + 9000 + Math.random() * 8000 });
    if (Math.random() < 0.15) db.interactive = db.interactive ? 0 : 1 + Math.floor(Math.random() * 2);
    emitOffice();
  }, 3500);

  // Prayer windows open at the adhan and close windowMin later.
  setInterval(() => {
    const t = now();
    const a = prayerState.active;
    if (a && Date.parse(a.endsAt) <= t) {
      prayerState.active = null;
      emit("prayer", prayer());
    } else if (!a) {
      const due = prayerTimes.find((p) => Date.parse(p.at) <= t && t - Date.parse(p.at) < WINDOW_MIN * 60_000 && t - Date.parse(p.at) < 6000);
      if (due) {
        prayerState.active = { name: due.name, startedAt: due.at, endsAt: iso(Date.parse(due.at) + WINDOW_MIN * 60_000) };
        emit("prayer", prayer());
      }
    }
  }, 2000);

  // Usage rescan every 30 s (faster in mock: 10 s).
  setInterval(() => {
    const add = { input: 3000, output: 1200, cacheWrite: 9000, cacheRead: 160_000 };
    db.todayExtra = addRow(db.todayExtra, { ...add, costUsd: costOf("claude-sonnet-4-5", add), messages: 3 });
    emit("usage", { today: todayRow() });
  }, 10_000);
}

export function mockEvents(onEvent: SseHandler, onStatus: (s: ConnStatus) => void): () => void {
  onStatus("connecting");
  startSimulation();
  const t = setTimeout(() => {
    listeners.add(onEvent);
    onStatus("open");
    emitOffice();
    onEvent("prayer", prayer());
    onEvent("questions", structuredClone(questions));
    onEvent("discussions", discussions.map(summaryOf));
  }, 250);
  return () => {
    clearTimeout(t);
    listeners.delete(onEvent);
  };
}

// ------------------------------------------------------------------ router
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findProject(id: string): ProjectSeed {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw new ApiError(`project ${id} not found`, 404);
  return p;
}

export async function mockRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await delay(60 + Math.random() * 120);
  const url = new URL(path, "http://mock");
  const parts = url.pathname.replace(/^\/api\//, "").split("/").map(decodeURIComponent);
  const r = route(method, parts, url.searchParams, body);
  return structuredClone(r) as T;
}

function route(method: string, p: string[], q: URLSearchParams, body: unknown): unknown {
  const [a, b, c, d] = p;
  const B = (body ?? {}) as Record<string, unknown>;
  if (method === "GET" && a === "overview") return overview();
  if (method === "GET" && a === "roles") return ROLE_INFO;
  if (method === "GET" && a === "kinds") return KINDS;
  if (a === "discussions") return discussionRoute(method, b, c, B);
  if (method === "GET" && a === "office") return office();
  if (method === "GET" && a === "sessions") return [...db.sessions].sort((x, y) => y.lastActivity.localeCompare(x.lastActivity));
  if (method === "GET" && a === "usage") return usage(Number(q.get("days") ?? 30));
  if (method === "GET" && a === "system" && b === "history") return { points: db.history };
  if (method === "GET" && a === "system") return system();
  if (method === "GET" && a === "prayer") return prayer();
  if (a === "questions") {
    if (method === "GET" && !b) return [...questions].sort((x, y) => (x.status === "open" ? 0 : 1) - (y.status === "open" ? 0 : 1) || y.askedAt.localeCompare(x.askedAt));
    const q = questions.find((x) => x.id === b);
    if (!q) throw new ApiError(`question ${b} not found`, 404);
    if (method === "POST" && c === "dismiss") {
      q.status = "dismissed";
      q.answeredAt = iso(now());
      emitQuestions();
      emitOffice();
      return q;
    }
    if (method === "POST" && c === "answer") {
      const req = B as { answer?: string; resume?: boolean; override?: boolean };
      if (!req.answer?.trim()) throw new ApiError("answer is required", 400);
      if (req.resume && prayerState.active && !req.override) {
        const n = prayerState.active.name;
        throw new ApiError(`Sholat ${n.charAt(0).toUpperCase() + n.slice(1)} in progress — resuming is held until ${hhmm(Date.parse(prayerState.active.endsAt))}`, 423);
      }
      q.status = "answered";
      q.answer = req.answer.trim();
      q.answeredAt = iso(now());
      let run: Run | null = null;
      if (req.resume && q.sessionId) {
        run = route("POST", ["runs"], new URLSearchParams(), {
          project: q.project,
          role: q.from,
          taskId: q.task ?? undefined,
          prompt: `Owner answered: ${q.answer}`,
          permissionMode: "acceptEdits",
          budgetUsd: 2,
          override: req.override,
        }) as Run;
        run.parentRunId = q.runId;
        run.questionId = q.id;
        run.sessionId = q.sessionId;
        q.resumedRun = run.id;
      }
      emitQuestions();
      emitOffice();
      return { question: q, run };
    }
  }

  if (a === "projects") {
    if (method === "GET" && !b) return db.projects.map(summary);
    if (method === "POST" && !b) {
      const req = B as unknown as RegisterProjectBody;
      if (!req.id || !/^[a-z0-9][a-z0-9-]*$/.test(req.id)) throw new ApiError("id must be lowercase letters, digits and dashes", 400);
      if (modeOf(req) === "clone" && !req.remote?.trim()) throw new ApiError("remote is required for repo mode clone", 400);
      if (db.projects.some((x) => x.id === req.id)) throw new ApiError(`project ${req.id} already registered`, 409);
      const seed: ProjectSeed = {
        id: req.id,
        name: req.name || req.id,
        type: req.type,
        classification: req.classification,
        remote: req.remote ?? "",
        defaultBranch: req.defaultBranch || "main",
        workingBranch: req.workingBranch || req.defaultBranch || "main",
        health: "unknown",
        kind: req.kind || "software",
        repoMode: modeOf(req),
        repoExists: !!req.clone && modeOf(req) !== "none",
        git: req.clone && modeOf(req) !== "none" ? { branch: req.defaultBranch || "main", dirty: 0, ahead: 0, behind: 0 } : null,
        features: [],
        decisions: [],
        projectMd: `# ${req.name || req.id}\n\nNewly registered project.\n`,
        statusMd: "# Status\n\nHealth: unknown\n",
        currentReportMd: "",
      };
      db.projects.push(seed);
      emit("workspace", { changed: ["projects"] });
      emitOffice();
      return summary(seed);
    }
    if (method === "POST" && b === "deactivate") {
      db.active = null;
      emit("workspace", { changed: ["active"] });
      emitOffice();
      return { ok: true };
    }
    const proj = findProject(b);
    if (method === "GET" && !c) return detail(proj);
    if (method === "POST" && c === "activate") {
      db.active = proj.id;
      emit("workspace", { changed: ["active"] });
      emitOffice();
      return summary(proj);
    }
    if (c === "tasks") {
      if (method === "GET" && !d) return db.tasks.filter((t) => t.project === proj.id).sort((x, y) => x.id.localeCompare(y.id));
      if (method === "POST" && !d) {
        if (!B.title || !B.owner) throw new ApiError("title and owner are required", 400);
        const n = db.tasks.filter((t) => t.project === proj.id).reduce((m, t) => Math.max(m, Number(t.id.split("-")[1]) || 0), 0) + 1;
        const task: Task = {
          id: `TASK-${String(n).padStart(3, "0")}`,
          project: proj.id,
          title: String(B.title),
          feature: (B.feature as string) || null,
          status: (B.status as TaskStatus) || "backlog",
          owner: String(B.owner),
          weight: (B.weight as number) ?? null,
          priority: (B.priority as string) || "medium",
          risk: (B.risk as string) || "low",
          description: (B.description as string) || "",
          requirements: (B.requirements as string[]) || [],
          acceptance_criteria: (B.acceptance_criteria as string[]) || [],
          dependencies: [],
          blocks: [],
          collaborators: [],
          reviewers: [],
          notes: [],
          git: { branch: null, commit: null },
          worktree: { required: false, path: null },
        };
        db.tasks.push(task);
        emit("workspace", { changed: ["tasks"] });
        emitOffice();
        return task;
      }
      if (method === "PATCH" && d) {
        const task = db.tasks.find((t) => t.project === proj.id && t.id === d);
        if (!task) throw new ApiError(`task ${d} not found`, 404);
        const { addNote, ...rest } = B as Partial<Task> & { addNote?: string };
        Object.assign(task, rest);
        if (addNote) task.notes.push(`${new Date().toISOString().slice(0, 10)} ${addNote}`);
        emit("workspace", { changed: ["tasks"] });
        emitOffice();
        return task;
      }
    }
  }

  if (a === "runs") {
    if (method === "GET" && !b) return [...db.runs].sort((x, y) => y.startedAt.localeCompare(x.startedAt));
    if (method === "POST" && !b) {
      const req = B as unknown as StartRunBody;
      findProject(req.project);
      if (!req.prompt?.trim()) throw new ApiError("prompt is required", 400);
      if (prayerState.active && !req.override) {
        const n = prayerState.active.name;
        throw new ApiError(`Sholat ${n.charAt(0).toUpperCase() + n.slice(1)} in progress — launches are held until ${hhmm(Date.parse(prayerState.active.endsAt))}`, 423);
      }
      if (db.runs.some((r) => r.project === req.project && r.role === req.role && r.status === "running"))
        throw new ApiError(`${req.role} already has a running run in ${req.project}`, 409);
      const id = `run-ui${Math.random().toString(16).slice(2, 6)}`;
      const run: Run = {
        id,
        project: req.project,
        role: req.role,
        taskId: req.taskId ?? null,
        prompt: req.prompt,
        status: "running",
        permissionMode: req.permissionMode,
        budgetUsd: req.budgetUsd,
        model: req.model ?? null,
        startedAt: iso(now()),
        endedAt: null,
        sessionId: crypto.randomUUID(),
        pid: 30000 + Math.floor(Math.random() * 9000),
        costUsd: null,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        numTurns: 0,
        lastActivity: iso(now()),
        lastText: "Starting",
        error: null,
      };
      db.runs.unshift(run);
      db.events.set(id, []);
      db.scriptPos.set(id, 0);
      pushEvent(run, { kind: "system", text: `session ${run.sessionId} · cwd repos/${run.project} · mode ${run.permissionMode}` });
      if (run.taskId) {
        const task = db.tasks.find((t) => t.project === run.project && t.id === run.taskId);
        if (task && (task.status === "backlog" || task.status === "ready")) {
          task.status = "active";
          emit("workspace", { changed: ["tasks"] });
        }
      }
      db.sessions.unshift({
        id: run.sessionId,
        project: run.project,
        cwd: `C:\\Users\\rizgust\\Projects-Centralized\\repos\\${run.project}`,
        source: "run",
        runId: id,
        startedAt: run.startedAt,
        lastActivity: run.startedAt,
        live: true,
        model: run.model ?? "claude-sonnet-4-5",
        messages: 0,
        tokens: run.tokens,
        costUsd: 0,
      } satisfies SessionInfo);
      emitRuns();
      emitOffice();
      return run;
    }
    const run = db.runs.find((r) => r.id === b);
    if (!run) throw new ApiError(`run ${b} not found`, 404);
    if (method === "POST" && c === "stop") {
      if (run.status === "running") finishRun(run, "stopped");
      return run;
    }
    if (method === "GET" && c === "events") {
      const after = Number(q.get("after") ?? 0);
      return (db.events.get(run.id) ?? []).filter((e) => e.seq > after);
    }
  }
  throw new ApiError(`mock: no route for ${method} /api/${p.join("/")}`, 404);
}

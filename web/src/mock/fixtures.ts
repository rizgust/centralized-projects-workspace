// Realistic fixture data for mock mode. Deterministic (seeded) so screenshots are stable.
import type { KindInfo, ProjectDetail, RepoMode, Role, RoleInfo, Run, SessionInfo, Task, TaskStatus, Tokens, UsageRow } from "../api/types";

export const KINDS: KindInfo[] = [
  { name: "software", description: "A product codebase: features, tests, releases. The full team works in a cloned repository.", repo: "clone", roles: ["analyst", "project-manager", "uiux", "frontend", "backend", "infra"], deliverable: "Working, tested software in the repo", agentHint: "Follow the repo's conventions; every change maps to a task." },
  { name: "prototype", description: "A quick full-stack mockup or spike to try an idea. Lives in a fresh local git repo.", repo: "local", roles: ["project-manager", "uiux", "frontend", "backend"], deliverable: "A clickable prototype and a short findings note", agentHint: "Speed over polish; record what was learned." },
  { name: "investigation", description: "A small research question: compare vendors, read docs, size an integration. No code repo.", repo: "none", roles: ["project-manager", "analyst", "infra"], deliverable: "A written recommendation with sources", agentHint: "Cite sources; end with a clear recommendation." },
  { name: "design", description: "Flows, screens and a visual system before any code is written.", repo: "none", roles: ["project-manager", "analyst", "uiux"], deliverable: "Specs, wireframes and a component inventory", agentHint: "Spec states and edge cases so Frontend need not guess." },
  { name: "general", description: "Anything else: planning, writing, admin. A small office with the PM and Analyst.", repo: "none", roles: ["project-manager", "analyst"], deliverable: "Whatever the Owner asks for, as files in the project folder", agentHint: "Keep notes in the project folder." },
];

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const iso = (ms: number) => new Date(ms).toISOString();

export const ROLE_INFO: RoleInfo[] = [
  { id: "analyst", name: "Analyst", file: "agents/analyst.md", description: "Investigates and scopes work: reads the codebase, issues and status, then breaks problems into clear, assignable tasks." },
  { id: "project-manager", name: "Project Manager", file: "agents/project-manager.md", description: "Owns the plan: sequences tasks, tracks progress and risk, keeps STATUS.md and the current report honest." },
  { id: "uiux", name: "UI/UX Designer", file: "agents/uiux-designer.md", description: "Designs flows, layouts and visual systems; writes UI specs and reviews implemented screens." },
  { id: "frontend", name: "Frontend Engineer", file: "agents/frontend-engineer.md", description: "Implements UI and client logic following the repo's conventions; verifies builds and type-checks." },
  { id: "backend", name: "Backend Engineer", file: "agents/backend-engineer.md", description: "Implements services, data models and APIs with tests; verifies the build before hand-off." },
  { id: "infra", name: "Infrastructure Engineer", file: "agents/infrastructure-engineer.md", description: "CI/CD, environments, deploys, cron jobs and observability. Keeps the pipes flowing." },
];

export interface ProjectSeed {
  id: string;
  name: string;
  type: string;
  classification: string;
  remote: string;
  defaultBranch: string;
  workingBranch: string;
  health: string;
  repoExists: boolean;
  kind: string;
  repoMode: RepoMode;
  git: { branch: string; dirty: number; ahead: number; behind: number } | null;
  features: ProjectDetail["features"];
  decisions: ProjectDetail["decisions"];
  projectMd: string;
  statusMd: string;
  currentReportMd: string;
}

export const PROJECTS: ProjectSeed[] = [
  {
    id: "atlas-web",
    name: "Atlas Web",
    type: "web-application",
    classification: "personal",
    remote: "git@github.com:example/atlas-web.git",
    defaultBranch: "main",
    workingBranch: "feat/monthly-report",
    health: "green",
    repoExists: true,
    kind: "software",
    repoMode: "clone",
    git: { branch: "feat/monthly-report", dirty: 3, ahead: 2, behind: 0 },
    features: [
      { id: "F-01", title: "Expense capture", status: "completed" },
      { id: "F-02", title: "Receipt parsing (AI)", status: "active" },
      { id: "F-03", title: "Plans, credits & billing", status: "active" },
      { id: "F-04", title: "Monthly reports", status: "active" },
    ],
    decisions: [
      { file: "ADR-001-postgres.md", title: "Use managed Postgres with row-level security", status: "accepted" },
      { file: "ADR-002-credit-model.md", title: "Credit model: text 1 / receipt 5", status: "accepted" },
      { file: "ADR-003-ocr.md", title: "Hosted OCR model for receipt parsing", status: "proposed" },
    ],
    projectMd: `# Atlas Web\n\nMulti-user expense tracker web app.\n\n- Capture expenses from a form or a receipt photo\n- AI parsing with usage limits per plan\n- Shared workspaces\n\n## Stack\n\n| Layer | Tech |\n|---|---|\n| Web | React + Vite |\n| API | Go service |\n| Data | Postgres |\n`,
    statusMd: `# Status\n\nHealth: green\n\nMonthly report chart is in progress; receipt parsing endpoint is mid-way.\n\n## Risks\n\n- Scheduler limits on the current hosting plan (**blocked**, see TASK-009)\n- OCR quota during launch week\n`,
    currentReportMd: `# Current report — week 40\n\n**Done:** schema for workspaces, expense list view, expense summary card.\n\n**In progress:** monthly report chart (frontend agent running), receipt parsing endpoint.\n\n**Next:** empty states, language toggle, Pro upgrade flow.\n\n> Owner decision needed: approve ADR-003 before launch week.\n`,
  },
  {
    id: "pixel-quest",
    name: "Pixel Quest",
    type: "game",
    classification: "personal",
    remote: "git@github.com:example/pixel-quest.git",
    defaultBranch: "main",
    workingBranch: "dev",
    health: "yellow",
    repoExists: true,
    kind: "prototype",
    repoMode: "local",
    git: { branch: "dev", dirty: 0, ahead: 0, behind: 4 },
    features: [
      { id: "F-01", title: "Core movement & combat", status: "completed" },
      { id: "F-02", title: "Inventory", status: "blocked" },
      { id: "F-03", title: "Enemy AI", status: "ready" },
    ],
    decisions: [{ file: "ADR-001-godot4.md", title: "Godot 4 + GDScript", status: "accepted" }],
    projectMd: `# Pixel Quest\n\nA small hex-grid roguelite built in **Godot 4**.\n\n- 16×16 tiles, 4-colour palettes per biome\n- Runs in ~20 minutes\n`,
    statusMd: `# Status\n\nHealth: yellow\n\nInventory drag & drop is blocked on an input-handling bug in the engine version we pin.\n`,
    currentReportMd: `# Current report\n\nPlaytest #3 feedback is being synthesised. CI export builds for Windows/Linux are in progress.\n`,
  },
  {
    id: "vendor-research",
    name: "Vendor Research",
    type: "template",
    classification: "work",
    remote: "",
    defaultBranch: "main",
    workingBranch: "main",
    health: "green",
    repoExists: false,
    kind: "investigation",
    repoMode: "none",
    git: null,
    features: [{ id: "F-01", title: "Payment provider shortlist", status: "active" }],
    decisions: [],
    projectMd: `# Vendor Research\n\nWhich payment provider should the products share? Compare fees, payouts in IDR, SDK quality and webhooks.\n\n- Shortlist 3 providers\n- Size the integration effort\n- Recommend one\n`,
    statusMd: `# Status\n\nHealth: green\n\nInvestigation in progress; no repository.\n`,
    currentReportMd: "",
  },
];

type T = [string, TaskStatus, Role, number, string, string, string | null, string];
// id, status, owner, weight, priority, risk, feature, title
const TASK_ROWS: Record<string, T[]> = {
  "atlas-web": [
    ["TASK-001", "completed", "analyst", 3, "high", "low", "F-02", "Scope receipt parsing accuracy targets"],
    ["TASK-002", "completed", "uiux", 2, "medium", "low", "F-01", "Design expense summary card"],
    ["TASK-003", "completed", "backend", 5, "high", "medium", "F-03", "Database schema for workspaces"],
    ["TASK-004", "completed", "frontend", 3, "medium", "low", "F-01", "Mini-app expense list view"],
    ["TASK-005", "review", "frontend", 2, "medium", "low", "F-01", "Category picker with search"],
    ["TASK-006", "review", "backend", 3, "high", "medium", "F-03", "Usage credit counter"],
    ["TASK-007", "active", "frontend", 5, "high", "medium", "F-04", "Monthly report chart"],
    ["TASK-008", "active", "backend", 8, "high", "high", "F-02", "Receipt parsing endpoint"],
    ["TASK-009", "blocked", "infra", 3, "medium", "medium", "F-04", "Scheduled job for monthly digest"],
    ["TASK-010", "ready", "frontend", 1, "low", "low", null, "Empty states for new workspaces"],
    ["TASK-011", "ready", "frontend", 2, "medium", "low", null, "Settings language toggle"],
    ["TASK-012", "ready", "uiux", 3, "high", "low", "F-03", "Pro plan upgrade flow"],
    ["TASK-013", "backlog", "project-manager", 1, "low", "low", "F-03", "Pricing page copy review"],
    ["TASK-014", "backlog", "analyst", 5, "medium", "medium", null, "Churn signals from usage logs"],
    ["TASK-015", "cancelled", "backend", 13, "low", "high", null, "Bank statement import"],
  ],
  "pixel-quest": [
    ["TASK-001", "completed", "uiux", 3, "medium", "low", "F-01", "Tileset palette v2"],
    ["TASK-002", "completed", "backend", 5, "high", "medium", "F-01", "Save-game serializer"],
    ["TASK-003", "active", "infra", 5, "medium", "medium", null, "CI export builds for Windows/Linux"],
    ["TASK-004", "blocked", "frontend", 3, "high", "high", "F-02", "Inventory UI drag & drop"],
    ["TASK-005", "review", "analyst", 2, "medium", "low", null, "Playtest #3 feedback synthesis"],
    ["TASK-006", "ready", "backend", 8, "high", "high", "F-03", "Enemy pathfinding on hex grid"],
    ["TASK-007", "backlog", "project-manager", 2, "medium", "low", null, "Milestone M2 plan"],
  ],
  "vendor-research": [
    ["TASK-001", "completed", "infra", 2, "medium", "low", "F-01", "Webhook reliability notes"],
    ["TASK-002", "active", "project-manager", 1, "medium", "low", null, "Investigation brief and scope"],
    ["TASK-003", "ready", "analyst", 3, "medium", "low", "F-01", "Compare fees and payout times"],
  ],
};

export function seedTasks(): Task[] {
  const out: Task[] = [];
  for (const [project, rows] of Object.entries(TASK_ROWS)) {
    for (const [id, status, owner, weight, priority, risk, feature, title] of rows) {
      out.push({
        id,
        project,
        title,
        feature,
        status,
        owner,
        weight,
        priority,
        risk,
        description: `${title}. Keep the change small and follow the existing conventions of the ${project} repo.`,
        requirements: ["Follow existing component and naming conventions", "No new dependencies without a decision log"],
        acceptance_criteria: ["Builds and type-checks", "Behaviour verified by qa-tester", "journal.md entry added"],
        dependencies: id === "TASK-007" && project === "atlas-web" ? ["TASK-004"] : [],
        blocks: id === "TASK-009" && project === "atlas-web" ? ["TASK-016"] : [],
        collaborators: owner === "frontend" ? ["uiux"] : [],
        reviewers: ["project-manager"],
        notes:
          status === "blocked"
            ? ["2026-10-04 blocked: waiting on an Owner decision (plan upgrade or external scheduler)"]
            : status === "completed"
              ? ["2026-10-02 verified by qa-tester"]
              : [],
        git: { branch: status === "active" ? `task/${id.toLowerCase()}` : null, commit: status === "completed" ? "a1b2c3d" : null },
        worktree: { required: status === "active", path: status === "active" ? `worktrees/${project}-${id.toLowerCase()}` : null },
      });
    }
  }
  return out;
}

export const zeroTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function seedRuns(now: number): Run[] {
  return [
    {
      id: "run-7f3a",
      project: "atlas-web",
      role: "frontend",
      taskId: "TASK-007",
      prompt: "Implement TASK-007 Monthly report chart. Reuse useExpenses; hand off to qa-tester when done.",
      status: "running",
      permissionMode: "acceptEdits",
      budgetUsd: 2,
      model: null,
      startedAt: iso(now - 6 * MIN),
      endedAt: null,
      sessionId: "c0ffee01-7f3a",
      pid: 21544,
      costUsd: null,
      tokens: { input: 18_402, output: 6_310, cacheRead: 412_880, cacheWrite: 38_104 },
      numTurns: 14,
      lastActivity: iso(now - 4000),
      lastText: "Edit",
      error: null,
    },
    {
      id: "run-5b21",
      project: "atlas-web",
      role: "backend",
      taskId: "TASK-006",
      prompt: "Implement TASK-006 usage credit counter with tests.",
      status: "succeeded",
      permissionMode: "acceptEdits",
      budgetUsd: 2,
      model: "claude-sonnet-4-5",
      startedAt: iso(now - 2 * HOUR - 20 * MIN),
      endedAt: iso(now - HOUR - 48 * MIN),
      sessionId: "c0ffee02-5b21",
      pid: null,
      costUsd: 1.42,
      tokens: { input: 41_220, output: 15_904, cacheRead: 1_302_114, cacheWrite: 96_330 },
      numTurns: 37,
      lastActivity: iso(now - HOUR - 48 * MIN),
      lastText: "Handed off to qa-tester.",
      error: null,
    },
    {
      id: "run-3c09",
      project: "pixel-quest",
      role: "infra",
      taskId: "TASK-003",
      prompt: "Set up CI export builds for Windows and Linux.",
      status: "failed",
      permissionMode: "bypassPermissions",
      budgetUsd: 10,
      model: "claude-opus-4-1",
      startedAt: iso(now - 5 * HOUR),
      endedAt: iso(now - 4 * HOUR - 21 * MIN),
      sessionId: "c0ffee03-3c09",
      pid: null,
      costUsd: 4.87,
      tokens: { input: 22_004, output: 9_870, cacheRead: 640_221, cacheWrite: 51_002 },
      numTurns: 22,
      lastActivity: iso(now - 4 * HOUR - 21 * MIN),
      lastText: "Bash",
      error: "godot --export-release exited 1: export templates missing",
    },
  ];
}

export const RUN_SCRIPT: { kind: "system" | "assistant_text" | "tool_use" | "tool_result" | "stderr"; text: string; tool?: string }[] = [
  { kind: "assistant_text", text: "Reading the existing report components so the chart matches conventions." },
  { kind: "tool_use", tool: "Read", text: "src/components/reports/MonthlyReport.tsx" },
  { kind: "tool_result", text: "142 lines" },
  { kind: "tool_use", tool: "Grep", text: 'pattern: "useExpenses" path: src/' },
  { kind: "tool_result", text: "5 matches in 3 files" },
  { kind: "assistant_text", text: "The chart can reuse `useExpenses(month)`; I'll add a column chart grouped by category." },
  { kind: "tool_use", tool: "Edit", text: "src/components/reports/MonthlyChart.tsx (+64 −3)" },
  { kind: "tool_result", text: "Applied 1 edit" },
  { kind: "tool_use", tool: "Bash", text: "bun run typecheck" },
  { kind: "stderr", text: "warning: 'formatCurrency' is deprecated, use formatMoney" },
  { kind: "tool_result", text: "exit 0 · 0 errors" },
  { kind: "tool_use", tool: "Edit", text: "src/lib/money.ts (+2 −2)" },
  { kind: "tool_result", text: "Applied 1 edit" },
  { kind: "tool_use", tool: "Bash", text: "bun run lint" },
  { kind: "tool_result", text: "exit 0" },
  { kind: "assistant_text", text: "Chart renders for empty months too. Updating journal.md before hand-off." },
  { kind: "tool_use", tool: "Write", text: "projects/atlas-web/journal.md" },
  { kind: "tool_result", text: "ok" },
];

export interface UsageDay {
  date: string;
  model: string;
  row: UsageRow;
}

export const MODELS = ["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"];
// Mock per-MTok prices (input, output, cacheWrite, cacheRead) — fixture only.
const PRICE: Record<string, [number, number, number, number]> = {
  "claude-opus-4-1": [15, 75, 18.75, 1.5],
  "claude-sonnet-4-5": [3, 15, 3.75, 0.3],
  "claude-haiku-4-5": [1, 5, 1.25, 0.1],
};

export function costOf(model: string, t: Tokens): number {
  const p = PRICE[model] ?? PRICE["claude-sonnet-4-5"];
  return (t.input * p[0] + t.output * p[1] + t.cacheWrite * p[2] + t.cacheRead * p[3]) / 1e6;
}

export function seedUsage(now: number, days = 90): UsageDay[] {
  const r = rng(42);
  const out: UsageDay[] = [];
  const share: Record<string, number> = { "claude-opus-4-1": 0.25, "claude-sonnet-4-5": 0.62, "claude-haiku-4-5": 0.13 };
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now - d * DAY);
    const date = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 0.6 + 0.4 * ((days - d) / days);
    const activity = (weekend ? 0.35 : 1) * trend * (0.55 + r() * 0.9) * (d === 0 ? 0.55 : 1);
    for (const model of MODELS) {
      const s = share[model] * activity;
      const t: Tokens = {
        input: Math.round(380_000 * s * (0.7 + r() * 0.6)),
        output: Math.round(140_000 * s * (0.7 + r() * 0.6)),
        cacheWrite: Math.round(1_100_000 * s * (0.7 + r() * 0.6)),
        cacheRead: Math.round(9_500_000 * s * (0.7 + r() * 0.6)),
      };
      out.push({ date, model, row: { ...t, costUsd: costOf(model, t), messages: Math.round(220 * s * (0.8 + r() * 0.4)) } });
    }
  }
  return out;
}

export const PROJECT_SHARE: [string, number][] = [
  ["atlas-web", 0.54],
  ["pixel-quest", 0.27],
  ["vendor-research", 0.11],
  ["workspace", 0.08],
];

export function seedSessions(now: number): SessionInfo[] {
  const r = rng(7);
  const rows: [string, "run" | "interactive", string | null, number, boolean, string][] = [
    ["workspace", "interactive", null, 3 * MIN, true, "claude-opus-4-1"],
    ["atlas-web", "run", "run-7f3a", 4 * 1000, true, "claude-sonnet-4-5"],
    ["atlas-web", "run", "run-5b21", HOUR + 48 * MIN, false, "claude-sonnet-4-5"],
    ["pixel-quest", "run", "run-3c09", 4 * HOUR + 21 * MIN, false, "claude-opus-4-1"],
    ["atlas-web", "interactive", null, 7 * HOUR, false, "claude-opus-4-1"],
    ["vendor-research", "interactive", null, DAY + 2 * HOUR, false, "claude-sonnet-4-5"],
    ["pixel-quest", "interactive", null, 2 * DAY, false, "claude-sonnet-4-5"],
    ["workspace", "interactive", null, 3 * DAY + 5 * HOUR, false, "claude-haiku-4-5"],
    ["atlas-web", "interactive", null, 4 * DAY, false, "claude-opus-4-1"],
    ["pixel-quest", "interactive", null, 6 * DAY, false, "claude-sonnet-4-5"],
  ];
  return rows.map(([project, source, runId, ago, live, model], i) => {
    const tokens: Tokens = {
      input: Math.round(10_000 + r() * 60_000),
      output: Math.round(4_000 + r() * 25_000),
      cacheWrite: Math.round(20_000 + r() * 120_000),
      cacheRead: Math.round(200_000 + r() * 2_200_000),
    };
    const start = now - ago - Math.round((20 + r() * 90) * MIN);
    return {
      id: `${(0xa1b2c3 + i * 7919).toString(16)}-${(1000 + i).toString(16)}-4c1e-9f0a-${(0x5e551 + i).toString(16)}`,
      project,
      cwd: project === "workspace" ? "C:\\Users\\rizgust\\Projects-Centralized" : `C:\\Users\\rizgust\\Projects-Centralized\\repos\\${project}`,
      source,
      runId,
      startedAt: iso(start),
      lastActivity: iso(now - ago),
      live,
      model,
      messages: Math.round(12 + r() * 160),
      tokens,
      costUsd: costOf(model, tokens),
    };
  });
}

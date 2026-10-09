import type {
  CreateTaskBody,
  Office,
  Overview,
  PrayerStatus,
  Question,
  KindInfo,
  Discussion,
  DiscussionSummary,
  NewDiscussionBody,
  PatchTaskBody,
  ProjectDetail,
  ProjectSummary,
  RegisterProjectBody,
  RoleInfo,
  Run,
  RunEvent,
  SessionInfo,
  SseEventMap,
  SseEventName,
  StartRunBody,
  SystemHistory,
  SystemSnapshot,
  Task,
  Usage,
} from "./types";

/** Mock mode: `?mock=1` in the URL, or VITE_MOCK=1 at build/dev time. */
export const MOCK: boolean =
  import.meta.env.VITE_MOCK === "1" || new URLSearchParams(window.location.search).get("mock") === "1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const mockModule = () => import("../mock/server");

let tokenPromise: Promise<string> | null = null;

/** Token from `<meta name="pc-token">` (production) or `GET /api/dev-token` (Vite dev). */
export function getToken(): Promise<string> {
  if (MOCK) return Promise.resolve("mock");
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="pc-token"]')?.content?.trim() ?? "";
      if (meta && !meta.startsWith("__")) return meta;
      const res = await fetch("api/dev-token");
      if (!res.ok) throw new ApiError("No token: server not running with --dev?", res.status);
      const text = (await res.text()).trim();
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed === "object" && "token" in parsed) return String((parsed as { token: unknown }).token);
      } catch {
        /* plain text token */
      }
      return text;
    })();
    tokenPromise.catch(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (MOCK) {
    const m = await mockModule();
    return m.mockRequest<T>(method, path, body);
  }
  const token = await getToken();
  // Relative URL so the app also works if served under a sub-path.
  const res = await fetch(path.replace(/^\//, ""), {
    method,
    headers: {
      "X-PC-Token": token,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  overview: () => request<Overview>("GET", "/api/overview"),
  projects: () => request<ProjectSummary[]>("GET", "/api/projects"),
  registerProject: (b: RegisterProjectBody) => request<ProjectSummary>("POST", "/api/projects", b),
  project: (id: string) => request<ProjectDetail>("GET", `/api/projects/${enc(id)}`),
  activate: (id: string) => request<ProjectSummary>("POST", `/api/projects/${enc(id)}/activate`),
  deactivate: () => request<{ ok: true }>("POST", "/api/projects/deactivate"),
  tasks: (project: string) => request<Task[]>("GET", `/api/projects/${enc(project)}/tasks`),
  createTask: (project: string, b: CreateTaskBody) => request<Task>("POST", `/api/projects/${enc(project)}/tasks`, b),
  patchTask: (project: string, taskId: string, b: PatchTaskBody) =>
    request<Task>("PATCH", `/api/projects/${enc(project)}/tasks/${enc(taskId)}`, b),
  roles: () => request<RoleInfo[]>("GET", "/api/roles"),
  office: () => request<Office>("GET", "/api/office"),
  runs: () => request<Run[]>("GET", "/api/runs"),
  startRun: (b: StartRunBody) => request<Run>("POST", "/api/runs", b),
  stopRun: (id: string) => request<Run>("POST", `/api/runs/${enc(id)}/stop`),
  runEvents: (id: string, after = 0) => request<RunEvent[]>("GET", `/api/runs/${enc(id)}/events?after=${after}`),
  sessions: () => request<SessionInfo[]>("GET", "/api/sessions"),
  usage: (days: number) => request<Usage>("GET", `/api/usage?days=${days}`),
  system: () => request<SystemSnapshot>("GET", "/api/system"),
  systemHistory: () => request<SystemHistory>("GET", "/api/system/history"),
  prayer: () => request<PrayerStatus>("GET", "/api/prayer"),
  questions: () => request<Question[]>("GET", "/api/questions"),
  answerQuestion: (id: string, b: { answer: string; resume?: boolean; override?: boolean }) =>
    request<{ question: Question; run: Run | null }>("POST", `/api/questions/${enc(id)}/answer`, b),
  kinds: () => request<KindInfo[]>("GET", "/api/kinds"),
  discussions: () => request<DiscussionSummary[]>("GET", "/api/discussions"),
  discussion: (id: string) => request<Discussion>("GET", `/api/discussions/${enc(id)}`),
  newDiscussion: (b: NewDiscussionBody) => request<{ discussion: Discussion; run: Run | null }>("POST", "/api/discussions", b),
  sendMessage: (id: string, text: string, override?: boolean) =>
    request<{ discussion: Discussion; run: Run | null }>("POST", `/api/discussions/${enc(id)}/messages`, { text, override: override || undefined }),
  wrapup: (id: string, override?: boolean) => request<{ discussion: Discussion; run: Run | null }>("POST", `/api/discussions/${enc(id)}/wrapup`, { override: override || undefined }),
  closeDiscussion: (id: string) => request<Discussion>("POST", `/api/discussions/${enc(id)}/close`),
  reopenDiscussion: (id: string) => request<Discussion>("POST", `/api/discussions/${enc(id)}/reopen`),
  dismissQuestion: (id: string) => request<Question>("POST", `/api/questions/${enc(id)}/dismiss`),
};

// ---------------------------------------------------------------- SSE

export type ConnStatus = "connecting" | "open" | "reconnecting";
export type SseHandler = <K extends SseEventName>(name: K, data: SseEventMap[K]) => void;

const SSE_EVENTS: SseEventName[] = ["system", "runs", "run-event", "workspace", "office", "usage", "prayer", "questions", "discussions"];

/**
 * Opens `/api/events` and reconnects with exponential backoff (1 s → 30 s).
 * Returns a disposer.
 */
export function openEvents(onEvent: SseHandler, onStatus: (s: ConnStatus) => void): () => void {
  if (MOCK) {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void mockModule().then((m) => {
      if (!cancelled) dispose = m.mockEvents(onEvent, onStatus);
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }

  let es: EventSource | null = null;
  let timer: number | undefined;
  let attempt = 0;
  let closed = false;

  const connect = async () => {
    onStatus(attempt === 0 ? "connecting" : "reconnecting");
    let token: string;
    try {
      token = await getToken();
    } catch {
      schedule();
      return;
    }
    if (closed) return;
    es = new EventSource(`api/events?token=${enc(token)}`);
    es.onopen = () => {
      attempt = 0;
      onStatus("open");
    };
    es.onerror = () => {
      es?.close();
      es = null;
      schedule();
    };
    for (const name of SSE_EVENTS) {
      es.addEventListener(name, (ev) => {
        try {
          onEvent(name, JSON.parse((ev as MessageEvent<string>).data));
        } catch {
          /* ignore malformed frame */
        }
      });
    }
  };

  const schedule = () => {
    if (closed) return;
    onStatus("reconnecting");
    const delay = Math.min(30_000, 1000 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
    attempt++;
    timer = window.setTimeout(connect, delay);
  };

  void connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    es?.close();
  };
}

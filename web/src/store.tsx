import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, openEvents, type ConnStatus } from "./api/client";
import type {
  Office,
  PrayerStatus,
  ProjectSummary,
  Question,
  Role,
  RoleInfo,
  Run,
  RunEvent,
  SseEventMap,
  SseEventName,
  SystemPoint,
  SystemSnapshot,
  UsageRow,
} from "./api/types";

export interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  text: string;
}

export interface LaunchPrefill {
  project?: string;
  role?: Role;
  taskId?: string;
  prompt?: string;
}

type Listener<K extends SseEventName> = (data: SseEventMap[K]) => void;

interface Live {
  conn: ConnStatus;
  workspace: { name: string; root: string } | null;
  projects: ProjectSummary[];
  activeProject: string | null;
  office: Office | null;
  runs: Run[];
  system: SystemSnapshot | null;
  sysPoints: SystemPoint[];
  usageToday: UsageRow | null;
  roles: RoleInfo[];
  prayer: PrayerStatus | null;
  questions: Question[];
  inbox: string | null | false;
  openInbox: (questionId?: string) => void;
  closeInbox: () => void;
  /** Bumped when the server reports workspace file changes; pages refetch on change. */
  tasksVersion: number;
  projectsVersion: number;
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  refreshProjects: () => Promise<void>;
  activate: (id: string | null) => Promise<void>;
  on: <K extends SseEventName>(name: K, fn: Listener<K>) => () => void;
  launch: LaunchPrefill | null;
  openLaunch: (p?: LaunchPrefill) => void;
  closeLaunch: () => void;
  registerOpen: boolean;
  setRegisterOpen: (v: boolean) => void;
  error: string | null;
}

const Ctx = createContext<Live | null>(null);

export function useLive(): Live {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

const MAX_POINTS = 450;

export function LiveProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [workspace, setWorkspace] = useState<Live["workspace"]>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [sysPoints, setSysPoints] = useState<SystemPoint[]>([]);
  const [usageToday, setUsageToday] = useState<UsageRow | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [prayer, setPrayerState] = useState<PrayerStatus | null>(null);
  const prevActive = useRef<string | null | undefined>(undefined);
  const [questions, setQuestionsState] = useState<Question[]>([]);
  const [inbox, setInbox] = useState<string | null | false>(false);
  const seenQ = useRef<Set<string> | null>(null);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [projectsVersion, setProjectsVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [launch, setLaunch] = useState<LaunchPrefill | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listeners = useRef(new Map<string, Set<(d: unknown) => void>>());
  const prevRuns = useRef(new Map<string, Run["status"]>());
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-4), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const on = useCallback(<K extends SseEventName>(name: K, fn: Listener<K>) => {
    let set = listeners.current.get(name);
    if (!set) listeners.current.set(name, (set = new Set()));
    set.add(fn as (d: unknown) => void);
    return () => {
      set!.delete(fn as (d: unknown) => void);
    };
  }, []);

  const refreshProjects = useCallback(async () => {
    const ov = await api.overview();
    setWorkspace(ov.workspace);
    setProjects(ov.projects);
    setActiveProject(ov.activeProject);
    setUsageToday(ov.usageToday);
    setSystem((s) => s ?? ov.system);
  }, []);

  const trackRuns = useCallback(
    (list: Run[], notify: boolean) => {
      for (const r of list) {
        const prev = prevRuns.current.get(r.id);
        if (notify && prev === "running" && r.status !== "running") {
          const label = `${roleLabel(r.role)} run ${r.id}${r.taskId ? ` (${r.taskId})` : ""}`;
          if (r.status === "succeeded") toast(`Run finished: ${label}`, "success");
          else if (r.status === "failed") toast(`Run failed: ${label}${r.error ? ` — ${r.error}` : ""}`, "error");
          else toast(`Run stopped: ${label}`, "info");
        }
        prevRuns.current.set(r.id, r.status);
      }
      setRuns(list);
    },
    [toast],
  );

  const setPrayer = useCallback(
    (p: PrayerStatus) => {
      const key = p.active ? p.active.name + p.active.startedAt : null;
      if (prevActive.current !== undefined && key && key !== prevActive.current) {
        const n = p.active!.name;
        toast(`Waktu sholat ${n.charAt(0).toUpperCase() + n.slice(1)} — agents berwudhu`, "info");
      }
      prevActive.current = key;
      setPrayerState(p);
    },
    [toast],
  );

  const setQuestions = useCallback(
    (qs: Question[]) => {
      const open = qs.filter((q) => q.status === "open");
      if (seenQ.current) {
        for (const q of open)
          if (!seenQ.current.has(q.id)) toast(`${ROLE_FULL[q.from] ?? roleLabel(q.from)} needs your answer`, "info");
      }
      seenQ.current = new Set(qs.map((q) => q.id));
      setQuestionsState(qs);
    },
    [toast],
  );

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ov, rl, of, rs, hist] = await Promise.all([api.overview(), api.roles(), api.office(), api.runs(), api.systemHistory()]);
        if (cancelled) return;
        setWorkspace(ov.workspace);
        setProjects(ov.projects);
        setActiveProject(ov.activeProject);
        setUsageToday(ov.usageToday);
        setSystem(ov.system);
        setRoles(rl);
        setOffice(of);
        trackRuns(rs, false);
        setSysPoints(hist.points.slice(-MAX_POINTS));
        setError(null);
        api.prayer().then(setPrayer).catch(() => {});
        api.questions().then(setQuestions).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackRuns, setPrayer, setQuestions]);

  // SSE.
  useEffect(() => {
    return openEvents((name, data) => {
      switch (name) {
        case "system": {
          const s = data as SseEventMap["system"];
          setSystem(s);
          setSysPoints((p) => [...p.slice(-(MAX_POINTS - 1)), { t: s.t, cpu: s.cpu.percent, mem: s.mem.percent }]);
          break;
        }
        case "runs":
          trackRuns(data as Run[], true);
          break;
        case "office":
          setOffice(data as Office);
          break;
        case "usage":
          setUsageToday((data as SseEventMap["usage"]).today);
          break;
        case "workspace": {
          const ch = (data as SseEventMap["workspace"]).changed;
          if (ch.includes("tasks")) setTasksVersion((v) => v + 1);
          if (ch.includes("projects") || ch.includes("active") || ch.includes("tasks")) {
            setProjectsVersion((v) => v + 1);
            void refreshProjects().catch(() => {});
          }
          break;
        }
        case "prayer":
          setPrayer(data as PrayerStatus);
          break;
        case "questions":
          setQuestions(data as Question[]);
          break;
        case "run-event":
          break;
      }
      listeners.current.get(name)?.forEach((fn) => fn(data));
    }, (s) => {
      setConn(s);
      // After a reconnect, resync state we may have missed.
      if (s === "open") {
        void api.runs().then((r) => trackRuns(r, false)).catch(() => {});
        void api.office().then(setOffice).catch(() => {});
      }
    });
  }, [trackRuns, refreshProjects, setPrayer, setQuestions]);

  const activate = useCallback(
    async (id: string | null) => {
      try {
        if (id) await api.activate(id);
        else await api.deactivate();
        await refreshProjects();
        setOffice(await api.office());
        toast(id ? `Active project: ${id}` : "No active project", "info");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      }
    },
    [refreshProjects, toast],
  );

  const value = useMemo<Live>(
    () => ({
      conn,
      workspace,
      projects,
      activeProject,
      office,
      runs,
      system,
      sysPoints,
      usageToday,
      roles,
      prayer,
      questions,
      inbox,
      openInbox: (id?: string) => setInbox(id ?? null),
      closeInbox: () => setInbox(false),
      tasksVersion,
      projectsVersion,
      toasts,
      toast,
      dismissToast,
      refreshProjects,
      activate,
      on,
      launch,
      openLaunch: (p) => setLaunch(p ?? {}),
      closeLaunch: () => setLaunch(null),
      registerOpen,
      setRegisterOpen,
      error,
    }),
    [conn, workspace, projects, activeProject, office, runs, system, sysPoints, usageToday, roles, prayer, questions, inbox, tasksVersion, projectsVersion, toasts, toast, dismissToast, refreshProjects, activate, on, launch, registerOpen, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Event log for one run: initial fetch, then live `run-event` appends. */
export function useRunEvents(runId: string | null): RunEvent[] {
  const { on } = useLive();
  const [events, setEvents] = useState<RunEvent[]>([]);
  useEffect(() => {
    setEvents([]);
    if (!runId) return;
    let cancelled = false;
    let lastSeq = 0;
    const buffer: RunEvent[] = [];
    const off = on("run-event", (d) => {
      if (d.runId !== runId) return;
      if (lastSeq === -1) buffer.push(d.event);
      else if (d.event.seq > lastSeq) {
        lastSeq = d.event.seq;
        setEvents((e) => [...e.slice(-999), d.event]);
      }
    });
    lastSeq = -1; // buffer until the initial fetch lands
    api
      .runEvents(runId, 0)
      .then((initial) => {
        if (cancelled) return;
        const max = initial.reduce((m, e) => Math.max(m, e.seq), 0);
        const extra = buffer.filter((e) => e.seq > max);
        lastSeq = Math.max(max, ...extra.map((e) => e.seq));
        setEvents([...initial, ...extra].slice(-1000));
      })
      .catch(() => {
        lastSeq = 0;
      });
    return () => {
      cancelled = true;
      off();
    };
  }, [runId, on]);
  return events;
}

export const ROLE_LABEL: Record<Role, string> = {
  analyst: "Analyst",
  "project-manager": "Project Manager",
  uiux: "UI/UX",
  frontend: "Frontend",
  backend: "Backend",
  infra: "Infra",
};

export const ROLE_FULL: Record<string, string> = {
  analyst: "Analyst",
  "project-manager": "Project Manager",
  uiux: "UI/UX Designer",
  frontend: "Frontend Engineer",
  backend: "Backend Engineer",
  infra: "Infrastructure Engineer",
};

export function roleLabel(r: string): string {
  return (ROLE_LABEL as Record<string, string>)[r] ?? r;
}

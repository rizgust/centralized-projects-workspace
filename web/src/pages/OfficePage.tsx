import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Role, Task, TaskStatus, Worker } from "../api/types";
import { TASK_STATUSES } from "../api/types";
import { OfficeCanvas, stationKey, type StationRef } from "../office/OfficeCanvas";
import { roomsOf } from "../office/world";
import { roleLabel, useLive, useRunEvents } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { Dialog, RunStatusBadge, TaskStatusBadge } from "../components/ui";
import { RunLog } from "../components/RunLog";
import { STATUS_LABEL, compact, duration, usd, totalTokens } from "../fmt";

const STATE_LABEL: Record<Worker["state"], string> = {
  working: "Working",
  asking: "Asking you",
  blocked: "Blocked",
  review: "Reviewing",
  waiting: "Waiting",
  idle: "Idle",
};
const STATE_SYM: Record<Worker["state"], string> = { working: "⌨", asking: "?", blocked: "!", review: "?", waiting: "≡", idle: "z" };

export function OfficePage() {
  const live = useLive();
  const { office, system, usageToday, runs } = live;
  const [sel, setSel] = useState<StationRef | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // runs that ended in the last 10 s show a done / sweat icon over their worker
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(t);
  }, []);
  const recent = useMemo(() => {
    const m = new Map<string, "done" | "sweat">();
    for (const r of runs)
      if (r.endedAt && now - Date.parse(r.endedAt) < 10_000 && r.status !== "running") m.set(stationKey(r.project, r.role), r.status === "succeeded" ? "done" : "sweat");
    return m;
  }, [runs, now]);
  const extras = useMemo(
    () => ({
      cpu: system?.cpu.percent ?? null,
      todayTokens: usageToday ? usageToday.input + usageToday.output + usageToday.cacheRead + usageToday.cacheWrite : null,
      todayCost: usageToday?.costUsd ?? null,
      interactive: office?.interactiveSessions ?? 0,
      recent,
      openQuestions: live.questions.filter((q) => q.status === "open").length,
    }),
    [system, usageToday, office?.interactiveSessions, recent, live.questions],
  );

  if (!office) return <p className="muted">Loading the office…</p>;
  const { rooms, hq } = roomsOf(office);
  const counts = rooms.flatMap((r) => r.workers).reduce<Record<string, number>>((a, w) => ((a[w.state] = (a[w.state] ?? 0) + 1), a), {});

  return (
    <div className="office-page">
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Office</h1>
          <p className="muted">
            {hq ? "No projects yet — the team is waiting at HQ." : `${rooms.length} project rooms`} ·{" "}
            {office.interactiveSessions > 0 ? `${office.interactiveSessions} interactive session${office.interactiveSessions > 1 ? "s" : ""} live` : "no interactive sessions"}
          </p>
        </div>
        <ul className="state-legend" aria-label="Worker states">
          {(Object.keys(STATE_LABEL) as Worker["state"][]).map((s) => (
            <li key={s} className={`state-pill state-${s}`}>
              <span aria-hidden="true">{STATE_SYM[s]}</span> {STATE_LABEL[s]} <strong>{counts[s] ?? 0}</strong>
            </li>
          ))}
        </ul>
      </div>

      <OfficeCanvas
        office={office}
        extras={extras}
        focusKey={focusKey ?? (sel ? stationKey(sel.project, sel.worker.role) : null)}
        onSelect={setSel}
        onRegister={() => live.setRegisterOpen(true)}
        prayer={live.prayer}
        onInbox={(id) => live.openInbox(id)}
        onTalk={() => live.openNewDiscussion({ role: "analyst", project: null })}
      />

      {hq && (
        <p className="center hq-cta">
          <button className="btn btn-primary" onClick={() => live.setRegisterOpen(true)}>
            + Register your first project
          </button>
        </p>
      )}

      <details className="roster-panel">
        <summary>Team status by room</summary>
      <section className="roster" aria-label="Workers by room">
        {rooms.map((r) => (
          <div key={r.project || "hq"} className={`roster-room${r.active && !hq ? " active" : ""}`}>
            <h2 className="roster-title">
              {r.name}
              {r.active && !hq && <span className="badge badge-active">Active</span>}
            </h2>
            <ul>
              {r.workers.map((w) => {
                const project = hq ? null : r.project;
                const key = stationKey(project, w.role);
                return (
                  <li key={key}>
                    <button
                      className="worker-chip"
                      onClick={() => setSel({ project, worker: w })}
                      onFocus={() => setFocusKey(key)}
                      onBlur={() => setFocusKey(null)}
                      onMouseEnter={() => setFocusKey(key)}
                      onMouseLeave={() => setFocusKey(null)}
                      aria-label={`${roleLabel(w.role)} in ${r.name}: ${STATE_LABEL[w.state]}${w.taskId ? `, ${w.taskId}` : ""}`}
                    >
                      <PixelAvatar role={w.role} scale={2} project={project} />
                      <span className="chip-text">
                        <span className="chip-role">{roleLabel(w.role)}</span>
                        <span className={`state-pill state-${w.state}`}>
                          <span aria-hidden="true">{STATE_SYM[w.state]}</span> {STATE_LABEL[w.state]}
                          {w.state === "waiting" && w.queued > 0 ? ` · ${w.queued}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      </details>

      <WorkerDrawer sel={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function WorkerDrawer({ sel, onClose }: { sel: StationRef | null; onClose: () => void }) {
  const live = useLive();
  const role = sel?.worker.role as Role | undefined;
  const project = sel?.project ?? null;
  // Prefer the fresh worker from the latest office snapshot.
  const worker = useMemo(() => {
    if (!sel || !live.office) return sel?.worker ?? null;
    const { rooms, hq } = roomsOf(live.office);
    const room = hq ? rooms[0] : rooms.find((r) => r.project === project);
    return room?.workers.find((w) => w.role === role) ?? sel.worker;
  }, [sel, live.office, project, role]);
  const run = live.runs.find((r) => r.id === worker?.runId) ?? live.runs.find((r) => r.status === "running" && r.role === role && r.project === project) ?? null;
  const events = useRunEvents(run?.status === "running" ? run.id : run?.id ?? null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const info = live.roles.find((r) => r.id === role);

  useEffect(() => {
    setTasks(null);
    if (!project || !role) return;
    let cancelled = false;
    api
      .tasks(project)
      .then((t) => !cancelled && setTasks(t.filter((x) => x.owner === role)))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [project, role, live.tasksVersion]);

  const byStatus = useMemo(() => {
    const m = new Map<TaskStatus, Task[]>();
    for (const t of tasks ?? []) m.set(t.status, [...(m.get(t.status) ?? []), t]);
    return m;
  }, [tasks]);

  const stop = async () => {
    if (!run) return;
    try {
      await api.stopRun(run.id);
      live.toast(`Stopping run ${run.id}`, "info");
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <Dialog
      open={!!sel}
      onClose={onClose}
      variant="drawer"
      title={
        worker && (
          <span className="drawer-title">
            <PixelAvatar role={worker.role} scale={3} project={project} />
            <span>
              {info?.name ?? roleLabel(worker.role)}
              <span className="muted small block">{project ? live.projects.find((p) => p.id === project)?.name ?? project : "HQ"}</span>
            </span>
          </span>
        )
      }
      footer={
        <>
          <button className="btn" disabled={!run || run.status !== "running"} onClick={stop}>
            ■ Stop run
          </button>
          {role === "analyst" && (
            <button className="btn" onClick={() => live.openNewDiscussion({ project, role: "analyst" })}>
              Discuss with Analyst
            </button>
          )}
          <button className="btn btn-primary" onClick={() => live.openLaunch({ project: project ?? undefined, role })}>
            Assign task
          </button>
        </>
      }
    >
      {worker && (
        <div className="stack">
          <p>
            <span className={`state-pill state-${worker.state}`}>
              <span aria-hidden="true">{STATE_SYM[worker.state]}</span> {STATE_LABEL[worker.state]}
            </span>{" "}
            {worker.taskId && (
              <span>
                on <strong>{worker.taskId}</strong> {worker.taskTitle}
              </span>
            )}
          </p>
          {info?.description && <p className="muted">{info.description}</p>}

          <section>
            <h3>Current run</h3>
            {run ? (
              <div className="stack-sm">
                <p className="row-wrap">
                  <RunStatusBadge status={run.status} />
                  <Link to={`/agents/runs/${encodeURIComponent(run.id)}`}>{run.id}</Link>
                  <span className="muted">
                    {duration(run.startedAt, run.endedAt)} · {run.numTurns} turns · {compact(totalTokens(run.tokens))} tok · {usd(run.costUsd)} / {usd(run.budgetUsd)}
                  </span>
                </p>
                <RunLog events={events} tail={40} compact />
              </div>
            ) : (
              <p className="muted">No run for this worker{project ? " in this project" : ""}.</p>
            )}
          </section>

          <section>
            <h3>Tasks owned</h3>
            {!project ? (
              <p className="muted">Register and activate a project to give this worker tasks.</p>
            ) : tasks === null ? (
              <p className="muted">Loading…</p>
            ) : tasks.length === 0 ? (
              <p className="muted">No tasks owned by {roleLabel(worker.role)}.</p>
            ) : (
              TASK_STATUSES.filter((s) => byStatus.has(s)).map((s) => (
                <div key={s} className="owned-group">
                  <h4>
                    {STATUS_LABEL[s]} <span className="muted">({byStatus.get(s)!.length})</span>
                  </h4>
                  <ul className="plain">
                    {byStatus.get(s)!.map((t) => (
                      <li key={t.id} className="owned-task">
                        <TaskStatusBadge status={t.status} /> <code>{t.id}</code> {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

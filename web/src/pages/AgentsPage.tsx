import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Role, Run, SessionInfo, Worker } from "../api/types";
import { ROLES } from "../api/types";
import { roleLabel, useLive } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { Empty, RunStatusBadge, Tabs } from "../components/ui";
import { ago, compact, dateTime, duration, totalTokens, usd } from "../fmt";

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const STATE_SYM: Record<Worker["state"], string> = { working: "⌨", asking: "?", proposing: "▤", blocked: "!", review: "?", waiting: "≡", idle: "z" };

export function AgentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "runs" | "sessions" | "questions") ?? "runs";
  const live = useLive();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Agents</h1>
          <p className="muted">{live.runs.filter((r) => r.status === "running").length} running · {live.runs.length} runs recorded</p>
        </div>
        <button className="btn btn-primary" onClick={() => live.openLaunch()}>
          + Launch agent
        </button>
      </div>
      <RoleCards />
      <Tabs
        label="Agent views"
        value={tab}
        onChange={(v) => setParams(v === "runs" ? {} : { tab: v })}
        items={[
          { id: "runs", label: "Runs" },
          { id: "sessions", label: "Sessions" },
          { id: "questions", label: `Questions${live.questions.some((q) => q.status === "open") ? ` (${live.questions.filter((q) => q.status === "open").length})` : ""}` },
        ]}
      />
      {tab === "runs" ? <RunsTable runs={live.runs} /> : tab === "sessions" ? <SessionsTable /> : <QuestionsTable />}
    </div>
  );
}

function RoleCards() {
  const live = useLive();
  const today = new Date().toDateString();
  const workersByRole = useMemo(() => {
    const m = new Map<Role, { worker: Worker; room: string }[]>();
    if (!live.office) return m;
    const rooms = live.office.rooms.length ? live.office.rooms : [{ name: "HQ", project: "", active: true, workers: live.office.hq }];
    for (const r of rooms) for (const w of r.workers) m.set(w.role, [...(m.get(w.role) ?? []), { worker: w, room: r.name }]);
    if (live.office.analyst) m.set("analyst", [{ worker: live.office.analyst, room: "the Owner's office" }]);
    return m;
  }, [live.office]);
  const rank: Record<Worker["state"], number> = { working: 0, asking: 1, proposing: 1, blocked: 2, review: 3, waiting: 4, idle: 5 };

  return (
    <div className="role-grid">
      {ROLES.map((role) => {
        const ws = (workersByRole.get(role) ?? []).sort((a, b) => rank[a.worker.state] - rank[b.worker.state]);
        const top = ws[0];
        const runsToday = live.runs.filter((r) => r.role === role && new Date(r.startedAt).toDateString() === today);
        const cost = runsToday.reduce((a, r) => a + (r.costUsd ?? 0), 0);
        const runningNow = runsToday.filter((r) => r.status === "running").length;
        const info = live.roles.find((r) => r.id === role);
        return (
          <article key={role} className="card role-card">
            <PixelAvatar role={role} scale={4} />
            <div className="role-body">
              <h2 className="h3">{info?.name ?? roleLabel(role)}</h2>
              {top ? (
                <p>
                  <span className={`state-pill state-${top.worker.state}`}>
                    <span aria-hidden="true">{STATE_SYM[top.worker.state]}</span> {top.worker.state}
                  </span>{" "}
                  <span className="muted small">in {top.room}</span>
                </p>
              ) : (
                <p className="muted">—</p>
              )}
              <p className="small truncate" title={top?.worker.taskTitle ?? ""}>
                {top?.worker.taskId ? (
                  <>
                    <code>{top.worker.taskId}</code> {top.worker.taskTitle}
                  </>
                ) : (
                  <span className="muted">No current task</span>
                )}
              </p>
              {role === "analyst" && live.office?.analyst && (
                <p className="small">
                  In the Owner's office
                  {(live.office.analyst.busy ?? []).length > 0 && (
                    <span className="muted">
                      {" "}
                      · busy on{" "}
                      {(live.office.analyst.busy ?? [])
                        .map((b) => `${live.projects.find((p) => p.id === b.project)?.name ?? b.project} (${b.state})`)
                        .join(", ")}
                    </span>
                  )}
                </p>
              )}
              <p className="small muted">
                {runsToday.length} run{runsToday.length === 1 ? "" : "s"} today{runningNow ? ` (${runningNow} running)` : ""} · {usd(cost)} today
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function RunsTable({ runs }: { runs: Run[] }) {
  const now = useNow();
  const live = useLive();
  if (!runs.length)
    return (
      <Empty title="No runs yet">
        <button className="btn btn-primary" onClick={() => live.openLaunch()}>
          + Launch agent
        </button>
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Status</th>
            <th>Run</th>
            <th>Role</th>
            <th>Project</th>
            <th>Task</th>
            <th>Started</th>
            <th className="num">Duration</th>
            <th className="num">Turns</th>
            <th className="num">Tokens</th>
            <th className="num">Cost / budget</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const pct = r.costUsd !== null ? Math.min(100, (r.costUsd / r.budgetUsd) * 100) : null;
            return (
              <tr key={r.id}>
                <td>
                  <RunStatusBadge status={r.status} />
                  {r.permissionMode === "bypassPermissions" && (
                    <span className="badge badge-danger" title="bypass permissions">
                      full
                    </span>
                  )}
                </td>
                <td>
                  <Link to={`/agents/runs/${encodeURIComponent(r.id)}`}>{r.id}</Link>
                  {r.status === "running" && <div className="muted small truncate">{r.lastText}</div>}
                  {r.error && <div className="text-critical small truncate" title={r.error}>{r.error}</div>}
                </td>
                <td className="nowrap">
                  <PixelAvatar role={r.role} scale={1} project={r.project} /> {roleLabel(r.role)}
                </td>
                <td className="nowrap">{r.project}</td>
                <td className="nowrap">{r.taskId ? <code>{r.taskId}</code> : <span className="muted">—</span>}</td>
                <td className="nowrap" title={r.startedAt}>
                  {dateTime(r.startedAt)}
                </td>
                <td className="num">{duration(r.startedAt, r.endedAt, now)}</td>
                <td className="num">{r.numTurns}</td>
                <td className="num" title={`in ${r.tokens.input} · out ${r.tokens.output} · cache read ${r.tokens.cacheRead} · cache write ${r.tokens.cacheWrite}`}>
                  {compact(totalTokens(r.tokens))}
                </td>
                <td className="num">
                  {usd(r.costUsd)} / {usd(r.budgetUsd)}
                  {pct !== null && (
                    <span className="mini-meter" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </td>
                <td>
                  {r.status === "running" && (
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        void api
                          .stopRun(r.id)
                          .then(() => live.toast(`Stopping ${r.id}`))
                          .catch((e) => live.toast(String(e instanceof Error ? e.message : e), "error"))
                      }
                    >
                      ■ Stop
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuestionsTable() {
  const live = useLive();
  if (!live.questions.length) return <Empty title="No questions from agents yet" />;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Status</th>
            <th>From</th>
            <th>Project</th>
            <th>Question</th>
            <th>Answer</th>
            <th>Asked</th>
            <th>Resumed run</th>
          </tr>
        </thead>
        <tbody>
          {live.questions.map((q) => (
            <tr key={q.id}>
              <td>
                <span className={`badge${q.status === "open" ? " badge-warn" : ""}`}>
                  {q.status === "open" ? "? open" : q.status === "answered" ? "✓ answered" : "× dismissed"}
                </span>
              </td>
              <td className="nowrap">
                <PixelAvatar role={q.from} scale={1} project={q.project} /> {roleLabel(q.from)}
              </td>
              <td className="nowrap">
                {q.project}
                {q.task && <div className="muted small">{q.task}</div>}
              </td>
              <td>
                {q.question}
                {q.source === "auto" && <div className="muted small">detected from the agent's last message</div>}
              </td>
              <td>{q.answer ?? (q.status === "open" ? <button className="btn btn-sm btn-primary" onClick={() => live.openInbox(q.id)}>Answer</button> : <span className="muted">—</span>)}</td>
              <td className="nowrap">{ago(q.askedAt)}</td>
              <td>{q.resumedRun ? <Link to={`/agents/runs/${encodeURIComponent(q.resumedRun)}`}>{q.resumedRun}</Link> : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionsTable() {
  const live = useLive();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .sessions()
        .then((s) => !cancelled && setSessions(s))
        .catch(() => !cancelled && setSessions([]));
    void load();
    const t = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [live.runs.length]);
  if (!sessions) return <p className="muted">Loading…</p>;
  if (!sessions.length) return <Empty title="No Claude Code sessions in the last 7 days" />;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Live</th>
            <th>Session</th>
            <th>Source</th>
            <th>Project</th>
            <th>Model</th>
            <th>Last activity</th>
            <th className="num">Messages</th>
            <th className="num">Tokens</th>
            <th className="num">API-eq. cost</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>
                {s.live ? (
                  <span className="live-dot on">
                    <span aria-hidden="true" /> live
                  </span>
                ) : (
                  <span className="live-dot">
                    <span aria-hidden="true" /> idle
                  </span>
                )}
              </td>
              <td>
                <code title={s.cwd}>{s.id.slice(0, 8)}</code>
                <div className="muted small truncate" title={s.cwd}>
                  {s.cwd}
                </div>
              </td>
              <td>
                {s.source === "run" && s.runId ? (
                  <Link to={`/agents/runs/${encodeURIComponent(s.runId)}`}>run {s.runId}</Link>
                ) : (
                  "interactive"
                )}
              </td>
              <td>{s.project}</td>
              <td className="small">{s.model}</td>
              <td title={s.lastActivity}>{ago(s.lastActivity)}</td>
              <td className="num">{s.messages}</td>
              <td className="num">{compact(totalTokens(s.tokens))}</td>
              <td className="num">{usd(s.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

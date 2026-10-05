import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { RunEventKind } from "../api/types";
import { roleLabel, useLive, useRunEvents } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { RunStatusBadge } from "../components/ui";
import { RunLog } from "../components/RunLog";
import { compact, dateTime, duration, num, totalTokens, usd } from "../fmt";
import { useNow } from "./AgentsPage";

const KINDS: { id: RunEventKind; label: string }[] = [
  { id: "assistant_text", label: "Text" },
  { id: "tool_use", label: "Tool calls" },
  { id: "tool_result", label: "Results" },
  { id: "stderr", label: "stderr" },
  { id: "system", label: "System" },
  { id: "result", label: "Result" },
];

export function RunDetailPage() {
  const { id = "" } = useParams();
  const live = useLive();
  const run = live.runs.find((r) => r.id === id) ?? null;
  const events = useRunEvents(id);
  const now = useNow();
  const [hidden, setHidden] = useState<Set<RunEventKind>>(new Set());
  const shown = useMemo(() => events.filter((e) => !hidden.has(e.kind)), [events, hidden]);

  if (!run) return <p className="muted">{live.runs.length ? `Run ${id} not found.` : "Loading…"}</p>;

  const stop = () =>
    void api
      .stopRun(run.id)
      .then(() => live.toast(`Stopping ${run.id}`))
      .catch((e) => live.toast(String(e instanceof Error ? e.message : e), "error"));

  return (
    <div>
      <p className="crumbs">
        <Link to="/agents">← Agents</Link>
      </p>
      <div className="page-head">
        <div className="row-wrap">
          <PixelAvatar role={run.role} scale={3} />
          <div>
            <h1 className="pixel-title">{run.id}</h1>
            <p className="muted">
              {roleLabel(run.role)} · {run.project}
              {run.taskId && (
                <>
                  {" "}
                  · <Link to={`/tasks?project=${encodeURIComponent(run.project)}`}>{run.taskId}</Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="row-wrap">
          <RunStatusBadge status={run.status} />
          <button className="btn" disabled={run.status !== "running"} onClick={stop}>
            ■ Stop
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Duration</span>
          <span className="kpi-value">{duration(run.startedAt, run.endedAt, now)}</span>
          <span className="kpi-sub">started {dateTime(run.startedAt)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Turns</span>
          <span className="kpi-value">{run.numTurns}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tokens</span>
          <span className="kpi-value">{compact(totalTokens(run.tokens))}</span>
          <span className="kpi-sub">
            in {num(run.tokens.input)} · out {num(run.tokens.output)} · cache r {compact(run.tokens.cacheRead)} / w {compact(run.tokens.cacheWrite)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Cost / budget</span>
          <span className="kpi-value">
            {usd(run.costUsd)} <span className="kpi-of">/ {usd(run.budgetUsd)}</span>
          </span>
          <span className="kpi-sub">{run.costUsd === null ? "exact cost arrives with the final result" : "from the final result event"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Mode</span>
          <span className="kpi-value small-value">{run.permissionMode === "bypassPermissions" ? "⚠ Full (bypass)" : "Safe (accept edits)"}</span>
          <span className="kpi-sub">
            model {run.model ?? "default"} · pid {run.pid ?? "—"}
          </span>
        </div>
      </div>

      {run.error && (
        <div className="banner banner-error" role="alert">
          ✕ {run.error}
        </div>
      )}

      <details className="card prompt-box">
        <summary>Prompt</summary>
        <pre className="wrap">{run.prompt}</pre>
      </details>

      <section className="card">
        <div className="row-between">
          <h2 className="h3">Event log {run.status === "running" && <span className="live-dot on"><span aria-hidden="true" /> streaming</span>}</h2>
          <div className="row-wrap" role="group" aria-label="Show event kinds">
            {KINDS.map((k) => (
              <label key={k.id} className="check small">
                <input
                  type="checkbox"
                  checked={!hidden.has(k.id)}
                  onChange={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(k.id)) n.delete(k.id);
                      else n.add(k.id);
                      return n;
                    })
                  }
                />
                {k.label}
              </label>
            ))}
          </div>
        </div>
        <RunLog events={shown} />
      </section>
    </div>
  );
}

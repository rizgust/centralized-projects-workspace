import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ProjectDetail } from "../api/types";
import { useLive } from "../store";
import { HealthBadge, KindBadge, Markdown, Progress, Tabs } from "../components/ui";

type Tab = "status" | "report" | "project";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const live = useLive();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("status");

  useEffect(() => {
    let cancelled = false;
    api
      .project(id)
      .then((d) => !cancelled && (setP(d), setErr(null)))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id, live.projectsVersion]);

  if (err) return <p className="form-error">{err}</p>;
  if (!p) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p className="crumbs">
        <Link to="/projects">← Projects</Link>
      </p>
      <div className="page-head">
        <div>
          <h1 className="pixel-title">
            {p.name} {p.active && <span className="badge badge-active">Active</span>} <KindBadge kind={p.kind} />
          </h1>
          <p className="muted">
            {p.id} · {p.type} · {p.classification} ·{" "}
            {p.repoMode === "none" ? "No repository" : (
              <>
                <code>{p.repoPath}</code> {p.repoExists ? "" : "(not cloned)"}
              </>
            )}
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn" disabled={p.active} onClick={() => void live.activate(p.id)}>
            {p.active ? "✓ Active" : "Activate"}
          </button>
          <Link className="btn" to={`/tasks?project=${encodeURIComponent(p.id)}`}>
            Open tasks
          </Link>
          <button className="btn" onClick={() => live.openNewDiscussion({ project: p.id, role: "analyst" })}>
            Discuss with Analyst
          </button>
          <button className="btn btn-primary" onClick={() => live.openLaunch({ project: p.id })}>
            Launch agent
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <Tabs
            label="Documents"
            value={tab}
            onChange={setTab}
            items={[
              { id: "status", label: "STATUS.md" },
              { id: "report", label: "Current report" },
              { id: "project", label: "PROJECT.md" },
            ]}
          />
          <div className="doc">
            {tab === "status" && <Markdown source={p.statusMd} />}
            {tab === "report" && <Markdown source={p.currentReportMd} empty="No current report." />}
            {tab === "project" && <Markdown source={p.projectMd} />}
          </div>
        </div>
        <aside className="stack">
          <div className="card stack-sm">
            <h2 className="h3">Health & progress</h2>
            <HealthBadge health={p.health} />
            <Progress value={p.weightDone} max={p.weightTotal} label="Progress" />
            <dl className="kv">
              <dt>Remote</dt>
              <dd>
                <code className="wrap">{p.remote || "—"}</code>
              </dd>
              <dt>Branches</dt>
              <dd>
                default <code>{p.defaultBranch}</code>, working <code>{p.workingBranch || p.defaultBranch}</code>
              </dd>
              <dt>Git</dt>
              <dd>{p.repoMode === "none" ? "No repository" : p.git ? `⎇ ${p.git.branch} · ${p.git.dirty} dirty · ↑${p.git.ahead} ↓${p.git.behind}` : "no git info"}</dd>
            </dl>
          </div>
          <div className="card">
            <h2 className="h3">Features</h2>
            {p.features.length === 0 ? (
              <p className="muted">No features recorded.</p>
            ) : (
              <ul className="plain list-lines">
                {p.features.map((f) => (
                  <li key={f.id}>
                    <code>{f.id}</code> {f.title} <span className="badge">{f.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h2 className="h3">Decisions</h2>
            {p.decisions.length === 0 ? (
              <p className="muted">No decision records.</p>
            ) : (
              <ul className="plain list-lines">
                {p.decisions.map((d) => (
                  <li key={d.file}>
                    {d.title} <span className="badge">{d.status}</span>
                    <div className="muted small">{d.file}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

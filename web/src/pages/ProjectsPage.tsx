import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProjectSummary } from "../api/types";
import { TASK_STATUSES } from "../api/types";
import { useLive } from "../store";
import { Empty, HealthBadge, KindBadge, Progress, Tabs } from "../components/ui";
import { STATUS_LABEL, STATUS_SYMBOL } from "../fmt";
import { PhaseBadge } from "./WorkflowPanel";

export function ProjectsPage() {
  const live = useLive();
  const [view, setView] = useState<"cards" | "table">("cards");
  const nav = useNavigate();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Projects</h1>
          <p className="muted">{live.projects.length} registered in workspace.yaml</p>
        </div>
        <div className="row-wrap">
          <Tabs label="View" value={view} onChange={setView} items={[{ id: "cards", label: "Cards" }, { id: "table", label: "Table" }]} />
          <button className="btn btn-primary" onClick={() => live.setRegisterOpen(true)}>
            + Register project
          </button>
        </div>
      </div>

      {live.projects.length === 0 ? (
        <Empty title="No projects registered yet">
          <p className="muted">Register a project to give your team a room in the office.</p>
          <button className="btn btn-primary" onClick={() => live.setRegisterOpen(true)}>
            + Register project
          </button>
        </Empty>
      ) : view === "cards" ? (
        <div className="card-grid">
          {live.projects.map((p) => (
            <ProjectCard key={p.id} p={p} onActivate={() => void live.activate(p.id)} onTasks={() => nav(`/tasks?project=${encodeURIComponent(p.id)}`)} />
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th>Type</th>
                <th>Class</th>
                <th>Health</th>
                <th>Progress</th>
                <th>Git</th>
                <th>Repo</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {live.projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${encodeURIComponent(p.id)}`}>{p.name}</Link> {p.active && <span className="badge badge-active">Active</span>}
                    <div className="muted small">{p.id}</div>
                  </td>
                  <td>{p.type}</td>
                  <td>{p.classification}</td>
                  <td>
                    <HealthBadge health={p.health} /> <KindBadge kind={p.kind} />
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <Progress value={p.weightDone} max={p.weightTotal} label={`${p.name} progress`} />
                  </td>
                  <td>
                    <GitLine p={p} />
                  </td>
                  <td>{p.repoMode === "none" ? "No repository" : p.repoExists ? "✓ present" : "× missing"}</td>
                  <td className="nowrap">
                    <button className="btn btn-sm" disabled={p.active} onClick={() => void live.activate(p.id)}>
                      Activate
                    </button>{" "}
                    <button className="btn btn-sm" onClick={() => nav(`/tasks?project=${encodeURIComponent(p.id)}`)}>
                      Tasks
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GitLine({ p }: { p: ProjectSummary }) {
  if (p.repoMode === "none") return <span className="muted">No repository</span>;
  if (!p.git) return <span className="muted">no git info</span>;
  return (
    <span className="git-line">
      <code>⎇ {p.git.branch}</code>
      {p.git.dirty > 0 && <span title="uncommitted changes"> ● {p.git.dirty} dirty</span>}
      {p.git.ahead > 0 && <span title="commits ahead"> ↑{p.git.ahead}</span>}
      {p.git.behind > 0 && <span title="commits behind"> ↓{p.git.behind}</span>}
      {p.git.dirty === 0 && p.git.ahead === 0 && p.git.behind === 0 && <span className="muted"> clean</span>}
    </span>
  );
}

function ProjectCard({ p, onActivate, onTasks }: { p: ProjectSummary; onActivate: () => void; onTasks: () => void }) {
  const live = useLive();
  const wf = live.workflows[p.id];
  const pending = wf?.delegations.filter((d) => d.status === "proposed").length ?? 0;
  const total = TASK_STATUSES.reduce((a, s) => a + (p.taskCounts[s] ?? 0), 0);
  return (
    <article className={`card project-card${p.active ? " is-active" : ""}`}>
      <header className="card-head">
        <div>
          <h2>
            <Link to={`/projects/${encodeURIComponent(p.id)}`}>{p.name}</Link>
          </h2>
          <p className="muted small">
            {p.id} · {p.type} · {p.classification}
          </p>
        </div>
        {p.active && <span className="badge badge-active">Active</span>}
      </header>
      <div className="row-wrap">
        <KindBadge kind={p.kind} />
        <PhaseBadge phase={wf?.workflow.phase} />
        {wf?.workflow.phase === "review" && <span className="badge badge-warn">awaiting your review</span>}
        {pending > 0 && <span className="badge badge-warn">{pending} proposal{pending > 1 ? "s" : ""} to approve</span>}
        <HealthBadge health={p.health} />
        {p.repoMode === "none" ? (
          <span className="badge">No repository</span>
        ) : (
          <span className={`badge ${p.repoExists ? "" : "badge-warn"}`}>{p.repoExists ? `✓ ${p.repoMode === "local" ? "local repo" : "repo present"}` : "× repo missing"}</span>
        )}
      </div>
      <Progress value={p.weightDone} max={p.weightTotal} label={`${p.name} progress`} />
      <ul className="count-row" aria-label={`${total} tasks by status`}>
        {TASK_STATUSES.filter((s) => p.taskCounts[s]).map((s) => (
          <li key={s} className={`count ts-${s}`} title={STATUS_LABEL[s]}>
            <span aria-hidden="true">{STATUS_SYMBOL[s]}</span> {p.taskCounts[s]} <span className="small">{STATUS_LABEL[s].toLowerCase()}</span>
          </li>
        ))}
      </ul>
      <p className="small">
        <GitLine p={p} />
      </p>
      <footer className="card-foot">
        <button className="btn btn-sm" disabled={p.active} onClick={onActivate}>
          {p.active ? "✓ Active" : "Activate"}
        </button>
        <Link className="btn btn-sm btn-primary" to={`/projects/${encodeURIComponent(p.id)}`}>
          Workflow →
        </Link>
        <button className="btn btn-sm" onClick={onTasks}>
          Open tasks
        </button>
        <Link className="btn btn-sm btn-ghost" to={`/projects/${encodeURIComponent(p.id)}?tab=docs`}>
          Docs
        </Link>
      </footer>
    </article>
  );
}

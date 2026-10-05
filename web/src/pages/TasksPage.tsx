import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Role, Task, TaskStatus } from "../api/types";
import { ROLES, TASK_STATUSES } from "../api/types";
import { roleLabel, useLive } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { Dialog, Empty, Field, TaskStatusBadge } from "../components/ui";
import { STATUS_LABEL, STATUS_SYMBOL } from "../fmt";

const WEIGHTS = [1, 2, 3, 5, 8, 13];
const LEVELS = ["low", "medium", "high", "critical"];

export function TasksPage() {
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const project = params.get("project") ?? live.activeProject ?? live.projects[0]?.id ?? "";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [owner, setOwner] = useState("");
  const [feature, setFeature] = useState("");
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    api
      .tasks(project)
      .then((t) => !cancelled && setTasks(t))
      .catch((e) => {
        if (!cancelled) {
          setTasks([]);
          live.toast(e instanceof Error ? e.message : String(e), "error");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, live.tasksVersion]);

  const features = useMemo(() => [...new Set((tasks ?? []).map((t) => t.feature).filter(Boolean) as string[])].sort(), [tasks]);
  const owners = useMemo(() => [...new Set([...ROLES, ...(tasks ?? []).map((t) => t.owner)])], [tasks]);
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (tasks ?? []).filter(
      (t) =>
        (!owner || t.owner === owner) &&
        (!feature || t.feature === feature) &&
        (!q || t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }, [tasks, owner, feature, text]);

  const move = async (id: string, status: TaskStatus) => {
    const t = tasks?.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const prev = tasks;
    setTasks((ts) => ts?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null);
    try {
      const updated = await api.patchTask(project, id, { status });
      setTasks((ts) => ts?.map((x) => (x.id === id ? updated : x)) ?? null);
      live.toast(`${id} moved to ${STATUS_LABEL[status]}`, "success");
    } catch (e) {
      setTasks(prev);
      live.toast(`Could not move ${id}: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const openTask = tasks?.find((t) => t.id === openId) ?? null;

  if (!live.projects.length)
    return (
      <Empty title="No projects yet">
        <button className="btn btn-primary" onClick={() => live.setRegisterOpen(true)}>
          + Register project
        </button>
      </Empty>
    );

  return (
    <div className="tasks-page">
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Tasks</h1>
          <p className="muted">
            {tasks ? `${filtered.length} of ${tasks.length} tasks` : "Loading…"} · drag cards between columns to change status
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New task
        </button>
      </div>

      <div className="filters" role="group" aria-label="Task filters">
        <Field label="Project">
          <select value={project} onChange={(e) => setParams({ project: e.target.value })}>
            {live.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? " (active)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {roleLabel(o)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Feature">
          <select value={feature} onChange={(e) => setFeature(e.target.value)}>
            <option value="">All features</option>
            {features.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="id, title, description" />
        </Field>
      </div>

      <div className="kanban" aria-label="Kanban board">
        {TASK_STATUSES.map((status) => {
          const col = filtered.filter((t) => t.status === status);
          return (
            <section
              key={status}
              className={`kcol kcol-${status}${overCol === status ? " drop" : ""}`}
              aria-label={`${STATUS_LABEL[status]} column, ${col.length} tasks`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overCol !== status) setOverCol(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverCol(null);
                setDragId(null);
                if (id) void move(id, status);
              }}
            >
              <h2 className="kcol-head">
                <span className={`sym ts-${status}`} aria-hidden="true">
                  {STATUS_SYMBOL[status]}
                </span>
                {STATUS_LABEL[status]}
                <span className="kcount">{col.length}</span>
              </h2>
              <ul className="kcards">
                {col.map((t) => (
                  <li
                    key={t.id}
                    className={`kcard${dragId === t.id ? " dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(t.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                  >
                    <button className="kcard-btn" onClick={() => setOpenId(t.id)} aria-label={`${t.id} ${t.title}, owner ${roleLabel(t.owner)}, ${STATUS_LABEL[t.status]}. Open details`}>
                      <span className="kcard-top">
                        <code>{t.id}</code>
                        {t.weight !== null && (
                          <span className="weight" title="weight">
                            w{t.weight}
                          </span>
                        )}
                      </span>
                      <span className="kcard-title">{t.title}</span>
                      <span className="kcard-meta">
                        <PixelAvatar role={t.owner} scale={1.5} />
                        <span className="small">{roleLabel(t.owner)}</span>
                        <span className={`lvl lvl-${t.priority}`} title="priority">
                          P:{t.priority}
                        </span>
                        <span className={`lvl lvl-${t.risk}`} title="risk">
                          R:{t.risk}
                        </span>
                      </span>
                      {t.feature && <span className="small muted">{t.feature}</span>}
                    </button>
                  </li>
                ))}
                {col.length === 0 && <li className="kempty">—</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <TaskDrawer
        project={project}
        task={openTask}
        onClose={() => setOpenId(null)}
        onChange={(t) => setTasks((ts) => ts?.map((x) => (x.id === t.id ? t : x)) ?? null)}
        onMove={move}
      />
      <CreateTaskDialog
        open={creating}
        project={project}
        features={features}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setTasks((ts) => [...(ts ?? []), t]);
          setCreating(false);
          live.toast(`Created ${t.id}`, "success");
        }}
      />
    </div>
  );
}

function TaskDrawer({
  project,
  task,
  onClose,
  onChange,
  onMove,
}: {
  project: string;
  task: Task | null;
  onClose: () => void;
  onChange: (t: Task) => void;
  onMove: (id: string, s: TaskStatus) => Promise<void>;
}) {
  const live = useLive();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(""), [task?.id]);

  const addNote = async () => {
    if (!task || !note.trim()) return;
    setBusy(true);
    try {
      onChange(await api.patchTask(project, task.id, { addNote: note.trim() }));
      setNote("");
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const list = (items: string[]) => (items.length ? <ul className="bullets">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">—</p>);

  return (
    <Dialog
      open={!!task}
      onClose={onClose}
      variant="drawer"
      title={task && <span>{task.id}</span>}
      footer={
        task && (
          <>
            <label className="inline-field">
              <span className="sr-only">Status</span>
              <select value={task.status} onChange={(e) => void onMove(task.id, e.target.value as TaskStatus)} aria-label="Change status">
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_SYMBOL[s]} {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary"
              onClick={() =>
                live.openLaunch({
                  project,
                  role: (ROLES.includes(task.owner as Role) ? task.owner : "frontend") as Role,
                  taskId: task.id,
                  prompt: `Work on ${task.id}: ${task.title}. Follow the task's requirements and acceptance criteria; hand off to qa-tester when ready.`,
                })
              }
            >
              ▶ Run with agent
            </button>
          </>
        )
      }
    >
      {task && (
        <div className="stack">
          <h3 className="task-title">{task.title}</h3>
          <div className="row-wrap">
            <TaskStatusBadge status={task.status} />
            <span className="badge">
              <PixelAvatar role={task.owner} scale={1} /> {roleLabel(task.owner)}
            </span>
            {task.weight !== null && <span className="badge">weight {task.weight}</span>}
            <span className={`badge lvl-${task.priority}`}>priority {task.priority}</span>
            <span className={`badge lvl-${task.risk}`}>risk {task.risk}</span>
            {task.feature && <span className="badge">{task.feature}</span>}
          </div>
          {task.description && <p>{task.description}</p>}
          <section>
            <h4>Requirements</h4>
            {list(task.requirements)}
          </section>
          <section>
            <h4>Acceptance criteria</h4>
            {list(task.acceptance_criteria)}
          </section>
          <dl className="kv">
            <dt>Dependencies</dt>
            <dd>{task.dependencies.join(", ") || "—"}</dd>
            <dt>Blocks</dt>
            <dd>{task.blocks.join(", ") || "—"}</dd>
            <dt>Collaborators</dt>
            <dd>{task.collaborators.map(roleLabel).join(", ") || "—"}</dd>
            <dt>Reviewers</dt>
            <dd>{task.reviewers.map(roleLabel).join(", ") || "—"}</dd>
            <dt>Git</dt>
            <dd>
              {task.git.branch ? <code>{task.git.branch}</code> : "no branch"}
              {task.git.commit && (
                <>
                  {" "}
                  @ <code>{task.git.commit}</code>
                </>
              )}
            </dd>
            <dt>Worktree</dt>
            <dd>{task.worktree.required ? <code>{task.worktree.path ?? "required (not created)"}</code> : "not required"}</dd>
          </dl>
          <section>
            <h4>Notes</h4>
            {list(task.notes)}
            <div className="note-add">
              <label className="sr-only" htmlFor="note-input">
                Add note
              </label>
              <input
                id="note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…"
                onKeyDown={(e) => e.key === "Enter" && void addNote()}
              />
              <button className="btn" disabled={!note.trim() || busy} onClick={addNote}>
                Add note
              </button>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  project,
  features,
  onClose,
  onCreated,
}: {
  open: boolean;
  project: string;
  features: string[];
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const empty = { title: "", owner: "frontend", weight: 2, priority: "medium", risk: "low", feature: "", description: "", requirements: "", acceptance: "", status: "backlog" as TaskStatus };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF(empty);
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean);

  const submit = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await api.createTask(project, {
        title: f.title.trim(),
        owner: f.owner,
        weight: f.weight,
        priority: f.priority,
        risk: f.risk,
        feature: f.feature.trim() || null,
        description: f.description.trim(),
        requirements: lines(f.requirements),
        acceptance_criteria: lines(f.acceptance),
        status: f.status,
      });
      onCreated(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`New task in ${project}`}
      wide
      footer={
        <>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!f.title.trim() || busy} onClick={submit}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus />
        </Field>
        <Field label="Owner">
          <select value={f.owner} onChange={(e) => set("owner", e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Initial status">
          <select value={f.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
            {(["backlog", "ready"] as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight">
          <select value={f.weight} onChange={(e) => set("weight", Number(e.target.value))}>
            {WEIGHTS.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        <Field label="Feature">
          <input list="feature-list" value={f.feature} onChange={(e) => set("feature", e.target.value)} placeholder="F-01" />
          <datalist id="feature-list">
            {features.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="Priority">
          <select value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Risk">
          <select value={f.risk} onChange={(e) => set("risk", e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Description" span>
          <textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Requirements" hint="One per line" >
          <textarea rows={4} value={f.requirements} onChange={(e) => set("requirements", e.target.value)} />
        </Field>
        <Field label="Acceptance criteria" hint="One per line">
          <textarea rows={4} value={f.acceptance} onChange={(e) => set("acceptance", e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

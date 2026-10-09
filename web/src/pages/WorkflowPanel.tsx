import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Delegation, Phase, ProjectDetail, ReportFile, Role, Task, WorkflowView } from "../api/types";
import { PHASES, ROLES, TASK_STATUSES } from "../api/types";
import { ROLE_FULL, roleLabel, useLive, useRunEvents } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { RunLog } from "../components/RunLog";
import { Dialog, Field, Markdown, TaskStatusBadge } from "../components/ui";
import { ago, dateTime, STATUS_LABEL, usd } from "../fmt";

const FIB = [1, 2, 3, 5, 8, 13];
const PHASE_LABEL: Record<Phase, string> = { intake: "Intake", brainstorm: "Brainstorm", planning: "Planning", review: "Review", execution: "Execution", done: "Done" };
const PHASE_HINT: Record<Phase, string> = {
  intake: "Give the Analyst the scope and requirements",
  brainstorm: "Brainstorm with the Analyst",
  planning: "The Analyst prepares the plan and tasks",
  review: "Review the plan and adjust task points",
  execution: "The PM delegates, monitors and reports",
  done: "Project closed",
};

export function PhaseBadge({ phase }: { phase?: Phase }) {
  if (!phase) return null;
  return (
    <span className={`badge phase-badge ph-${phase}`} title={PHASE_HINT[phase]}>
      <span aria-hidden="true" className="sym">
        {PHASES.indexOf(phase) + 1}
      </span>
      {PHASE_LABEL[phase]}
    </span>
  );
}

/** Hook: the project's workflow view from the store (refetched on SSE `workflow`). */
export function useWorkflow(project: string): WorkflowView | null {
  const live = useLive();
  const w = live.workflows[project] ?? null;
  const { refreshWorkflow } = live;
  useEffect(() => {
    if (!w) void refreshWorkflow(project);
  }, [project, w, refreshWorkflow]);
  return w;
}

/** 423 during sholat: inline "do it anyway" pattern shared by the workflow actions. */
function useHold() {
  const live = useLive();
  const [held, setHeld] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const active = live.prayer?.active && live.prayer.config.holdLaunches ? live.prayer.active : null;
  const blocked = (!!active || !!held) && !override;
  const run = async <T,>(fn: (override: boolean) => Promise<T>): Promise<T | null> => {
    try {
      const r = await fn(override);
      setHeld(null);
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) {
        setHeld(e.message);
        return null;
      }
      live.toast(e instanceof Error ? e.message : String(e), "error");
      return null;
    }
  };
  const banner =
    active || held ? (
      <div className="info-box" role="status">
        <strong>{active ? `Sholat ${active.name.charAt(0).toUpperCase() + active.name.slice(1)} berjamaah` : "Sholat in progress"}</strong>
        <span>{active ? `Agent work is held until ${new Date(active.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.` : held}</span>
        <label className="check">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Do it anyway (override the sholat hold)
        </label>
      </div>
    ) : null;
  return { run, blocked, banner };
}

// ================================================================== stepper
export function PhaseStepper({ view }: { view: WorkflowView }) {
  const cur = PHASES.indexOf(view.workflow.phase);
  const last = (ph: Phase) => [...view.workflow.history].reverse().find((h) => h.phase === ph);
  return (
    <ol className="stepper" aria-label="Project phases">
      {PHASES.map((ph, i) => {
        const h = last(ph);
        const state = i < cur ? "done" : i === cur ? "current" : "todo";
        return (
          <li key={ph} className={`step-${state}`} aria-current={i === cur ? "step" : undefined} title={h ? `${PHASE_LABEL[ph]} · ${h.by} · ${dateTime(h.at)}${h.note ? ` · ${h.note}` : ""}` : PHASE_HINT[ph]}>
            <span className="step-dot" aria-hidden="true">
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="step-label">{PHASE_LABEL[ph]}</span>
            <span className="step-sub">{h ? `${h.by} · ${ago(h.at)}` : state === "todo" ? "" : PHASE_HINT[ph]}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ================================================================== panel
export function WorkflowPanel({ p }: { p: ProjectDetail }) {
  const view = useWorkflow(p.id);
  const [settings, setSettings] = useState(false);
  if (!view) return <p className="muted">Loading workflow…</p>;
  const phase = view.workflow.phase;
  return (
    <div className="stack wf">
      <div className="row-between">
        <PhaseStepper view={view} />
        <button className="btn btn-sm btn-ghost" onClick={() => setSettings(true)}>
          ⚙ Settings
        </button>
      </div>
      {phase === "intake" && <IntakePanel p={p} />}
      {phase === "brainstorm" && <BrainstormPanel p={p} />}
      {phase === "planning" && <PlanningPanel p={p} />}
      {phase === "review" && <ReviewPanel p={p} view={view} />}
      {(phase === "execution" || phase === "done") && <ExecutionPanel p={p} view={view} />}
      <SettingsDrawer open={settings} onClose={() => setSettings(false)} view={view} />
    </div>
  );
}

// ------------------------------------------------------------------ intake
function IntakePanel({ p }: { p: ProjectDetail }) {
  const live = useLive();
  const path = p.kind && p.kind !== "software" ? "brief.md" : "requirements/product.md";
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .getDoc(p.id, path)
      .then((d) => {
        if (cancelled) return;
        setText(d.content);
        setSaved(d.content);
      })
      .catch(() => !cancelled && (setText(""), setSaved("")));
    return () => {
      cancelled = true;
    };
  }, [p.id, path]);
  const save = async () => {
    if (text === null) return;
    setBusy(true);
    try {
      const d = await api.putDoc(p.id, path, text);
      setSaved(d.content);
      live.toast(`Saved ${path}`, "success");
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (text !== null && text !== saved) await save();
    try {
      await api.setPhase(p.id, "brainstorm", "Scope handed to the Analyst");
      await live.refreshWorkflow(p.id);
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <section className="card wf-panel">
      <header className="wf-head">
        <div>
          <h2 className="h3">Scope & requirements</h2>
          <p className="muted small">
            What should this project achieve? The Analyst reads <code>projects/{p.id}/{path}</code> before brainstorming.
          </p>
        </div>
        <div className="tabs">
          <button className={`tab${!preview ? " on" : ""}`} onClick={() => setPreview(false)}>
            Edit
          </button>
          <button className={`tab${preview ? " on" : ""}`} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </header>
      {text === null ? (
        <p className="muted">Loading…</p>
      ) : preview ? (
        <div className="doc-preview">
          <Markdown source={text} empty="Nothing written yet." />
        </div>
      ) : (
        <textarea className="doc-editor" rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder={"# Scope\n\nWhat, for whom, and what done looks like.\n\n## Requirements\n- …"} aria-label={path} />
      )}
      <footer className="row-wrap wf-actions">
        <span className="muted small">{text !== null && text !== saved ? "Unsaved changes" : saved ? "Saved" : ""}</span>
        <button className="btn" disabled={busy || text === saved} onClick={save}>
          Save
        </button>
        <button className="btn btn-primary" disabled={busy || !text?.trim()} onClick={start}>
          Start brainstorm →
        </button>
      </footer>
    </section>
  );
}

// ------------------------------------------------------------------ brainstorm
function BrainstormPanel({ p }: { p: ProjectDetail }) {
  const live = useLive();
  const list = live.discussions.filter((d) => d.project === p.id);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const hold = useHold();
  const plan = async () => {
    setBusy(true);
    const r = await hold.run((o) => api.preparePlan(p.id, extra.trim() || undefined, o));
    if (r) {
      live.toast(`The Analyst is preparing the plan (run ${r.run.id})`, "success");
      await live.refreshWorkflow(p.id);
    }
    setBusy(false);
  };
  return (
    <div className="wf-two">
      <section className="card wf-panel">
        <header className="wf-head">
          <h2 className="h3">Brainstorm with the Analyst</h2>
          <button className="btn" onClick={() => live.openNewDiscussion({ project: p.id, role: "analyst" })}>
            Discuss with Analyst
          </button>
        </header>
        {list.length === 0 ? (
          <p className="muted">No discussions yet. Start one to explore ideas, integrations and risks.</p>
        ) : (
          <ul className="plain list-lines">
            {list.map((d) => (
              <li key={d.id} className="row-between">
                <span>
                  <Link to={`/discuss?id=${encodeURIComponent(d.id)}`}>{d.topic}</Link>{" "}
                  {d.wrappedUp && <span className="badge">✓ wrapped up</span>} {d.status === "closed" && <span className="badge">closed</span>}
                  <div className="muted small">
                    {ROLE_FULL[d.role]} · {d.turns} messages · {ago(d.updatedAt)}
                  </div>
                </span>
                {d.running && <span className="live-dot on"><span aria-hidden="true" /> replying</span>}
              </li>
            ))}
          </ul>
        )}
        {list.some((d) => d.wrappedUp) && (
          <div className="wf-highlights">
            <h3 className="h4">Wrap-up highlights</h3>
            {list
              .filter((d) => d.wrappedUp)
              .map((d) => (
                <p key={d.id} className="small">
                  <strong>{d.topic}:</strong> {d.lastMessage.replace(/[#*>|]/g, "").replace(/\s+/g, " ").slice(0, 180)}
                  {" "}
                  <Link to={`/discuss?id=${encodeURIComponent(d.id)}`}>open</Link>
                </p>
              ))}
          </div>
        )}
      </section>
      <section className="card wf-panel wf-cta">
        <h2 className="h3">Ready for a plan?</h2>
        <p className="muted small">The Analyst turns the scope and these discussions into plan.md, handover.md and tasks with weight points. You review it next.</p>
        <Field label="Extra instructions (optional)">
          <textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. keep v1 under 40 points; no new dependencies" />
        </Field>
        {hold.banner}
        <button className="btn btn-primary btn-big" disabled={busy || hold.blocked} onClick={plan}>
          {busy ? "Starting…" : "Ask Analyst to prepare the plan"}
        </button>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ planning
function PlanningPanel({ p }: { p: ProjectDetail }) {
  const live = useLive();
  const run = live.runs.find((r) => r.project === p.id && r.status === "running" && (r.purpose === "plan" || r.purpose === "revise" || (!r.purpose && r.role === "analyst")));
  const events = useRunEvents(run?.id ?? null);
  const tools = events.filter((e) => e.kind === "tool_use").length;
  return (
    <section className="card wf-panel">
      <header className="wf-head">
        <span className="row-wrap">
          <PixelAvatar role="analyst" project={p.id} scale={3} />
          <span>
            <h2 className="h3">The Analyst is preparing the plan</h2>
            <span className="muted small">{run ? `${run.purpose === "revise" ? "Revising" : "Planning"} · run ${run.id} · ${tools} tool calls so far` : "Waiting for the plan run to report…"}</span>
          </span>
        </span>
        <span className="dots" aria-label="working">
          <span />
          <span />
          <span />
        </span>
      </header>
      <p className="muted small">The project moves to Review by itself when the run succeeds.</p>
      {run ? <RunLog events={events} /> : <p className="muted">No running plan run found yet.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ review
function FibPicker({ value, onPick, label }: { value: number | null; onPick: (n: number) => void; label: string }) {
  return (
    <span className="fib" role="radiogroup" aria-label={label}>
      {FIB.map((n) => (
        <button key={n} role="radio" aria-checked={value === n} className={`fib-btn${value === n ? " on" : ""}`} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </span>
  );
}

function ReviewPanel({ p, view }: { p: ProjectDetail; view: WorkflowView }) {
  const live = useLive();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [changes, setChanges] = useState<string | null>(null);
  const [approve, setApprove] = useState(false);
  const hold = useHold();
  const load = () => api.tasks(p.id).then(setTasks).catch(() => setTasks([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, live.tasksVersion, view]);

  const active = (tasks ?? []).filter((t) => t.status !== "cancelled");
  const total = active.reduce((a, t) => a + (t.weight ?? 0), 0);
  const byRole = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of active) m[t.owner] = (m[t.owner] ?? 0) + (t.weight ?? 0);
    return m;
  }, [active]);

  const setWeight = async (t: Task, w: number) => {
    setTasks((ts) => ts?.map((x) => (x.id === t.id ? { ...x, weight: w, proposedWeight: x.proposedWeight ?? x.weight } : x)) ?? null);
    try {
      const u = await api.patchTask(p.id, t.id, { weight: w });
      setTasks((ts) => ts?.map((x) => (x.id === t.id ? u : x)) ?? null);
      await live.refreshWorkflow(p.id);
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
      void load();
    }
  };
  const sendChanges = async () => {
    if (!changes?.trim()) return;
    const r = await hold.run((o) => api.requestChanges(p.id, changes.trim(), o));
    if (r) {
      live.toast("Sent back to the Analyst for changes", "success");
      setChanges(null);
      await live.refreshWorkflow(p.id);
    }
  };

  return (
    <div className="stack">
      <div className="review-grid">
        <section className="card wf-panel review-plan">
          <h2 className="h3">plan.md</h2>
          <div className="doc-preview">
            <Markdown source={view.plan ?? ""} empty="The Analyst didn't write a plan.md." />
          </div>
          <details className="handover">
            <summary>handover.md</summary>
            <Markdown source={view.handover ?? ""} empty="No handover notes." />
          </details>
        </section>
        <section className="card wf-panel">
          <header className="wf-head">
            <div>
              <h2 className="h3">Tasks & weight points</h2>
              <p className="muted small">Adjust points with the Fibonacci picker; the Analyst's original stays visible.</p>
            </div>
            <div className="wf-total">
              <span className="kpi-label">Total</span>
              <span className="kpi-value">{total}</span>
              <span className="muted small">{active.length} tasks</span>
            </div>
          </header>
          <ul className="role-weights" aria-label="Weight per role">
            {Object.entries(byRole)
              .sort((a, b) => b[1] - a[1])
              .map(([r, w]) => (
                <li key={r} className="badge">
                  <PixelAvatar role={r} project={p.id} scale={1} /> {roleLabel(r)} <strong>{w}</strong>
                </li>
              ))}
          </ul>
          {view.adjusted.length > 0 && (
            <div className="row-wrap" aria-label="Adjusted weights">
              <span className="muted small">Adjusted:</span>
              {view.adjusted.map((a) => (
                <span key={a.task} className="badge adj-chip" title={a.title}>
                  {a.task} <s>{a.from}</s> → <strong>{a.to}</strong>
                </span>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table className="tbl review-tbl">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Feature</th>
                  <th>Depends</th>
                  <th>Risk</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                {tasks === null && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {active.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <code>{t.id}</code> {t.title}
                      <div>
                        <TaskStatusBadge status={t.status} />
                      </div>
                    </td>
                    <td className="nowrap">
                      <PixelAvatar role={t.owner} project={p.id} scale={1} /> {roleLabel(t.owner)}
                    </td>
                    <td>{t.feature ?? <span className="muted">—</span>}</td>
                    <td className="small">{t.dependencies.join(", ") || <span className="muted">—</span>}</td>
                    <td className={`lvl lvl-${t.risk}`}>{t.risk}</td>
                    <td className="nowrap">
                      <FibPicker value={t.weight} onPick={(n) => void setWeight(t, n)} label={`Weight of ${t.id}`} />
                      {t.proposedWeight != null && t.proposedWeight !== t.weight && (
                        <span className="badge was" title="The Analyst's original estimate">
                          <s>{t.proposedWeight}</s>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.notReady.length > 0 && <NotReady p={p} view={view} tasks={tasks ?? []} onSaved={load} />}
        </section>
      </div>
      {hold.banner}
      <div className="row-wrap wf-actions review-actions">
        <button className="btn" onClick={() => setChanges("")}>
          Request changes
        </button>
        <button className="btn btn-primary btn-big" disabled={hold.blocked} onClick={() => setApprove(true)}>
          Approve plan & hand over to PM
        </button>
      </div>
      <Dialog
        open={changes !== null}
        onClose={() => setChanges(null)}
        title="Request changes"
        footer={
          <>
            <button className="btn" onClick={() => setChanges(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!changes?.trim() || hold.blocked} onClick={sendChanges}>
              Send to Analyst
            </button>
          </>
        }
      >
        <Field label="What should the Analyst change?">
          <textarea rows={6} value={changes ?? ""} onChange={(e) => setChanges(e.target.value)} placeholder="e.g. split TASK-006 into a spike and the implementation; add tests to the acceptance criteria" autoFocus />
        </Field>
      </Dialog>
      <ApproveDialog open={approve} onClose={() => setApprove(false)} p={p} view={view} tasks={active} total={total} />
    </div>
  );
}

function NotReady({ p, view, tasks, onSaved }: { p: ProjectDetail; view: WorkflowView; tasks: Task[]; onSaved: () => void }) {
  const live = useLive();
  const [edit, setEdit] = useState<Record<string, Record<string, string | number>>>({});
  const save = async (id: string) => {
    const e = edit[id] ?? {};
    const lines = (v: unknown) =>
      String(v ?? "")
        .split("\n")
        .map((x) => x.replace(/^\s*[-*]\s*/, "").trim())
        .filter(Boolean);
    const body: Partial<Task> = {};
    if (e.weight !== undefined) body.weight = Number(e.weight);
    if (e.description !== undefined) body.description = String(e.description);
    if (e.requirements !== undefined) body.requirements = lines(e.requirements);
    if (e.acceptance_criteria !== undefined) body.acceptance_criteria = lines(e.acceptance_criteria);
    try {
      await api.patchTask(p.id, id, body);
      live.toast(`${id} updated`, "success");
      setEdit((x) => ({ ...x, [id]: {} }));
      onSaved();
      await live.refreshWorkflow(p.id);
    } catch (err) {
      live.toast(err instanceof Error ? err.message : String(err), "error");
    }
  };
  return (
    <div className="not-ready">
      <h3 className="h4">
        <span aria-hidden="true">!</span> Not ready ({view.notReady.length}) — these stay in backlog on approval
      </h3>
      <ul className="plain">
        {view.notReady.map((n) => {
          const t = tasks.find((x) => x.id === n.task);
          const e = edit[n.task] ?? {};
          const set = (k: string, v: string | number) => setEdit((x) => ({ ...x, [n.task]: { ...(x[n.task] ?? {}), [k]: v } }));
          return (
            <li key={n.task} className="nr-item">
              <div>
                <code>{n.task}</code> {n.title} <span className="muted small">missing: {n.missing.join(", ")}</span>
              </div>
              <div className="nr-fields">
                {n.missing.includes("weight") && (
                  <label className="field">
                    <span className="field-label">Weight</span>
                    <FibPicker value={(e.weight as number) ?? t?.weight ?? null} onPick={(v) => set("weight", v)} label={`Weight of ${n.task}`} />
                  </label>
                )}
                {n.missing.includes("description") && (
                  <Field label="Description">
                    <input value={(e.description as string) ?? ""} onChange={(ev) => set("description", ev.target.value)} />
                  </Field>
                )}
                {n.missing.includes("requirements") && (
                  <Field label="Requirements (one per line)">
                    <textarea rows={2} value={(e.requirements as string) ?? ""} onChange={(ev) => set("requirements", ev.target.value)} />
                  </Field>
                )}
                {n.missing.includes("acceptance_criteria") && (
                  <Field label="Acceptance criteria (one per line)">
                    <textarea rows={2} value={(e.acceptance_criteria as string) ?? ""} onChange={(ev) => set("acceptance_criteria", ev.target.value)} />
                  </Field>
                )}
                <div className="row-wrap">
                  <button className="btn btn-sm btn-primary" disabled={!Object.keys(e).length} onClick={() => void save(n.task)}>
                    Save
                  </button>
                  <Link className="btn btn-sm btn-ghost" to={`/tasks?project=${encodeURIComponent(p.id)}`}>
                    Open in Tasks
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ApproveDialog({ open, onClose, p, view, tasks, total }: { open: boolean; onClose: () => void; p: ProjectDetail; view: WorkflowView; tasks: Task[]; total: number }) {
  const live = useLive();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ readied: number; warning?: string } | null>(null);
  const hold = useHold();
  useEffect(() => {
    if (open) {
      setComment("");
      setResult(null);
    }
  }, [open]);
  const willReady = tasks.filter((t) => t.status === "backlog" && !view.notReady.some((n) => n.task === t.id)).length;
  const go = async () => {
    setBusy(true);
    const r = await hold.run((o) => api.approvePlan(p.id, comment.trim() || undefined, o));
    setBusy(false);
    if (r) {
      setResult(r);
      live.toast(`Plan approved: ${r.readied} tasks ready; the PM takes over`, "success");
      await live.refreshWorkflow(p.id);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Approve plan & hand over to the PM"
      footer={
        result ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || hold.blocked} onClick={go}>
              {busy ? "Approving…" : "Approve & hand over"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="stack-sm">
          <p className="answered-note">
            ✓ Plan approved. <strong>{result.readied}</strong> task{result.readied === 1 ? "" : "s"} moved to Ready; the PM is writing the kickoff report and will propose the first delegation.
          </p>
          {result.warning && (
            <div className="warn-box" role="alert">
              <strong>⚠ Warning:</strong> {result.warning}
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <div className="kpis approve-kpis">
            <div className="kpi">
              <span className="kpi-label">Tasks</span>
              <span className="kpi-value">{tasks.length}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Total weight</span>
              <span className="kpi-value">{total}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Your adjustments</span>
              <span className="kpi-value">{view.adjusted.length}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Will become ready</span>
              <span className="kpi-value">{willReady}</span>
            </div>
          </div>
          {view.notReady.length > 0 && <p className="muted small">{view.notReady.length} not-ready task(s) stay in backlog: {view.notReady.map((n) => n.task).join(", ")}.</p>}
          <p className="small">
            Delegation mode: <strong>PM proposes, you approve</strong>. The PM won't launch anything without your approval.
          </p>
          <Field label="Comment for the PM (optional)">
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. prioritise the playtest build" />
          </Field>
          {hold.banner}
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ execution
export function DelegationCard({ project, d, compact }: { project: string; d: Delegation; compact?: boolean }) {
  const live = useLive();
  const [pick, setPick] = useState<Record<string, boolean>>(() => Object.fromEntries(d.items.map((i) => [i.task, true])));
  const [budgets, setBudgets] = useState<Record<string, string>>(() => Object.fromEntries(d.items.map((i) => [i.task, String(i.budgetUsd)])));
  const [reject, setReject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = d.items.filter((i) => pick[i.task]);
  const sum = chosen.reduce((a, i) => a + (Number(budgets[i.task]) || 0), 0);
  const approve = async () => {
    setBusy(true);
    try {
      await api.approveDelegation(project, d.id, {
        tasks: chosen.map((i) => i.task),
        budgets: Object.fromEntries(chosen.map((i) => [i.task, Number(budgets[i.task]) || i.budgetUsd])),
      });
      live.toast(`Approved ${chosen.length} task${chosen.length === 1 ? "" : "s"}; the PM launches them`, "success");
      await live.refreshWorkflow(project);
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const doReject = async () => {
    setBusy(true);
    try {
      await api.rejectDelegation(project, d.id, reject?.trim() || undefined);
      live.toast("Proposal rejected", "info");
      setReject(null);
      await live.refreshWorkflow(project);
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`card dlg-card${compact ? " compact" : ""}`} aria-label={`Delegation proposal ${d.id}`}>
      <header className="row-between">
        <span className="row-wrap">
          <PixelAvatar role="project-manager" project={project} scale={2} />
          <strong>PM proposes</strong> <span className="muted small">{d.id} · {ago(d.createdAt)}</span>
        </span>
        <span className="muted small">{usd(sum)} total</span>
      </header>
      <p className="small">{d.reason}</p>
      <ul className="plain dlg-items">
        {d.items.map((it) => (
          <li key={it.task} className={pick[it.task] ? "" : "off"}>
            <label className="check">
              <input type="checkbox" checked={!!pick[it.task]} onChange={(e) => setPick((x) => ({ ...x, [it.task]: e.target.checked }))} aria-label={`Include ${it.task}`} />
              <PixelAvatar role={it.role} project={project} scale={1.5} />
              <span>
                <code>{it.task}</code> <span className="muted small">{roleLabel(it.role)}</span>
                {it.note && <div className="muted small">{it.note}</div>}
              </span>
            </label>
            <label className="budget-in">
              <span className="sr-only">Budget for {it.task}</span>$
              <input type="number" min={0.1} step={0.5} value={budgets[it.task]} disabled={!pick[it.task]} onChange={(e) => setBudgets((x) => ({ ...x, [it.task]: e.target.value }))} />
            </label>
          </li>
        ))}
      </ul>
      {reject !== null && (
        <Field label="Why reject? (optional)">
          <textarea rows={2} value={reject} onChange={(e) => setReject(e.target.value)} />
        </Field>
      )}
      <footer className="row-wrap wf-actions">
        {reject === null ? (
          <button className="btn" disabled={busy} onClick={() => setReject("")}>
            Reject…
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setReject(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={doReject}>
              Reject proposal
            </button>
          </>
        )}
        <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={approve}>
          Approve selected ({chosen.length})
        </button>
      </footer>
    </article>
  );
}

const ITEM_SYM: Record<string, string> = { proposed: "○", queued: "◌", launched: "▶", done: "✓", failed: "✕", skipped: "–" };

function ExecutionPanel({ p, view }: { p: ProjectDetail; view: WorkflowView }) {
  const live = useLive();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [report, setReport] = useState<ReportFile | null>(null);
  const [askReport, setAskReport] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const hold = useHold();
  useEffect(() => {
    api.tasks(p.id).then(setTasks).catch(() => setTasks([]));
  }, [p.id, live.tasksVersion, view]);
  // ?report=<file> opens a report (from the "PM report" toast)
  useEffect(() => {
    const m = window.location.hash.match(/[?&]report=([^&]+)/);
    if (!m) return;
    const file = decodeURIComponent(m[1]);
    api
      .reports(p.id, true)
      .then((rs) => setReport(rs.find((r) => r.file === file) ?? null))
      .catch(() => {});
  }, [p.id, view.reports.length]);
  const openReport = async (r: ReportFile) => {
    try {
      const rs = await api.reports(p.id, true);
      setReport(rs.find((x) => x.file === r.file) ?? r);
    } catch {
      setReport(r);
    }
  };

  const active = tasks.filter((t) => t.status !== "cancelled");
  const total = active.reduce((a, t) => a + (t.weight ?? 0), 0);
  const done = active.filter((t) => t.status === "completed").reduce((a, t) => a + (t.weight ?? 0), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const lim = view.workflow.limits;
  const spendPct = Math.min(100, (view.spentToday / Math.max(0.01, lim.dailyBudgetUsd)) * 100);
  const proposals = view.delegations.filter((d) => d.status === "proposed");
  const past = view.delegations.filter((d) => d.status !== "proposed");
  const focus = window.location.hash.includes("focus=approvals");

  const propose = async () => {
    const r = await hold.run((o) => api.proposeDelegation(p.id, o));
    if (r) live.toast("Asked the PM for a delegation proposal", "success");
  };
  const sendReport = async () => {
    const r = await hold.run((o) => api.requestReport(p.id, askReport?.trim() || undefined, o));
    if (r) {
      live.toast("Asked the PM for a report", "success");
      setAskReport(null);
    }
  };

  return (
    <div className="stack">
      <div className="kpis exec-kpis">
        <div className="kpi wide">
          <span className="kpi-label">Progress (weight)</span>
          <span className="kpi-value">
            {done} <span className="kpi-of">/ {total}</span>
          </span>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Completed weight">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="kpi-sub">
            {TASK_STATUSES.filter((s) => active.some((t) => t.status === s))
              .map((s) => `${active.filter((t) => t.status === s).length} ${STATUS_LABEL[s].toLowerCase()}`)
              .join(" · ")}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Spent today</span>
          <span className="kpi-value">
            {usd(view.spentToday)} <span className="kpi-of">/ {usd(lim.dailyBudgetUsd)}</span>
          </span>
          <div className={`meter ${spendPct >= 90 ? "meter-critical" : spendPct >= 75 ? "meter-warning" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(spendPct)} aria-label="Daily budget used">
            <span style={{ width: `${spendPct}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-label">Running work</span>
          <span className="kpi-value">
            {view.runningWork} <span className="kpi-of">/ {lim.maxParallel}</span>
          </span>
          <span className="kpi-sub">max parallel</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">PM</span>
          <span className="kpi-value small-value">{view.pmBusy ? "● busy" : "○ idle"}</span>
          <span className="kpi-sub">{view.lastReportAt ? `last report ${ago(view.lastReportAt)}` : "no reports yet"}</span>
        </div>
      </div>
      {hold.banner}
      <div className="wf-two">
        <section className={`card wf-panel${focus ? " focus-ring" : ""}`} id="approvals">
          <header className="wf-head">
            <h2 className="h3">Delegations</h2>
            <button className="btn btn-sm" disabled={hold.blocked || view.workflow.phase === "done"} onClick={propose}>
              Ask PM to propose now
            </button>
          </header>
          {proposals.length === 0 && <p className="muted small">No proposal waiting. The PM proposes the next wave when slots and budget free up.</p>}
          {proposals.map((d) => (
            <DelegationCard key={d.id} project={p.id} d={d} />
          ))}
          {past.length > 0 && (
            <details className="past-dlg">
              <summary>Past delegations ({past.length})</summary>
              {past.map((d) => (
                <div key={d.id} className="past-item">
                  <div className="row-between">
                    <strong>
                      {d.id} · {d.status}
                    </strong>
                    <span className="muted small">{d.decidedAt ? dateTime(d.decidedAt) : ago(d.createdAt)}</span>
                  </div>
                  {d.comment && <p className="small muted">“{d.comment}”</p>}
                  <ul className="plain">
                    {d.items.map((it) => (
                      <li key={it.task} className="small">
                        <span aria-hidden="true">{ITEM_SYM[it.status]}</span> <code>{it.task}</code> {roleLabel(it.role)} · {it.status}
                        {it.runId && (
                          <>
                            {" · "}
                            <Link to={`/agents/runs/${encodeURIComponent(it.runId)}`}>{it.runId}</Link>
                          </>
                        )}
                        {it.detail && <span className="muted"> · {it.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          )}
        </section>
        <div className="stack">
          <section className="card wf-panel">
            <header className="wf-head">
              <h2 className="h3">PM reports</h2>
              <button className="btn btn-sm" disabled={hold.blocked} onClick={() => setAskReport("")}>
                Ask PM for a report
              </button>
            </header>
            {askReport !== null && (
              <div className="stack-sm">
                <Field label="What do you want to know? (optional)">
                  <textarea rows={2} value={askReport} onChange={(e) => setAskReport(e.target.value)} placeholder="e.g. are we on track for Friday?" />
                </Field>
                <div className="row-wrap">
                  <button className="btn btn-sm btn-ghost" onClick={() => setAskReport(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={sendReport}>
                    Request report
                  </button>
                </div>
              </div>
            )}
            {view.reports.length === 0 ? (
              <p className="muted small">No reports yet.</p>
            ) : (
              <ul className="plain list-lines">
                {view.reports.map((r) => (
                  <li key={r.file}>
                    <button className="link-btn" onClick={() => void openReport(r)}>
                      <span className={`badge rtype rt-${r.type}`}>{r.type}</span> {r.title}
                    </button>
                    <div className="muted small">{dateTime(r.at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card wf-panel">
            <h2 className="h3">Talk to another agent</h2>
            <p className="muted small">The PM prepares a briefing, then opens the discussion. The Analyst is always available directly.</p>
            <div className="row-wrap">
              <button className="btn btn-sm" onClick={() => setArrange(true)}>
                Ask PM to arrange a talk…
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => live.openNewDiscussion({ project: p.id, role: "analyst" })}>
                Discuss with Analyst
              </button>
            </div>
          </section>
          {view.workflow.phase !== "done" && (
            <button className="btn btn-ghost close-project" onClick={() => setCloseOpen(true)}>
              Close project…
            </button>
          )}
        </div>
      </div>
      <Dialog open={!!report} onClose={() => setReport(null)} variant="drawer" title={report && <span><span className={`badge rtype rt-${report.type}`}>{report.type}</span> {report.title}</span>}>
        {report && (
          <div className="stack-sm">
            <p className="muted small">
              {report.file} · {dateTime(report.at)}
            </p>
            <Markdown source={report.body ?? ""} empty="(empty report)" />
          </div>
        )}
      </Dialog>
      <ArrangeDialog open={arrange} onClose={() => setArrange(false)} project={p.id} />
      <Dialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close project?"
        footer={
          <>
            <button className="btn" onClick={() => setCloseOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await api.setPhase(p.id, "done", "Closed by the Owner");
                  await live.refreshWorkflow(p.id);
                  setCloseOpen(false);
                } catch (e) {
                  live.toast(e instanceof Error ? e.message : String(e), "error");
                }
              }}
            >
              Close project
            </button>
          </>
        }
      >
        <p>
          The project moves to <strong>Done</strong>. {done}/{total} weight is completed; open tasks stay as they are.
        </p>
      </Dialog>
    </div>
  );
}

export function ArrangeDialog({ open, onClose, project, role: initialRole, topic: initialTopic }: { open: boolean; onClose: () => void; project: string; role?: Role; topic?: string }) {
  const live = useLive();
  const [role, setRole] = useState<Role>(initialRole ?? "backend");
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<{ at: number; role: Role; topic: string } | null>(null);
  const hold = useHold();
  useEffect(() => {
    if (open) {
      setRole(initialRole ?? "backend");
      setTopic(initialTopic ?? "");
      setStarted(null);
    }
  }, [open, initialRole, initialTopic]);
  const found = started ? live.discussions.find((d) => d.project === project && d.role === started.role && d.topic === started.topic) : null;
  const go = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    const r = await hold.run((o) => api.arrange(project, role, topic.trim(), o));
    setBusy(false);
    if (r) setStarted({ at: Date.now(), role, topic: topic.trim() });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ask the PM to arrange a talk"
      footer={
        started ? (
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || !topic.trim() || hold.blocked} onClick={go}>
              {busy ? "Asking…" : "Ask PM to arrange"}
            </button>
          </>
        )
      }
    >
      {started ? (
        <div className="stack-sm">
          <p className="answered-note">✓ The PM is briefing the {ROLE_FULL[started.role]}. The discussion opens when the briefing is done.</p>
          {found ? (
            <p>
              Discussion ready:{" "}
              <Link to={`/discuss?id=${encodeURIComponent(found.id)}`} onClick={onClose}>
                {found.topic} →
              </Link>
            </p>
          ) : (
            <p className="muted small">
              <span className="dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>{" "}
              Waiting for the briefing…
            </p>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="muted small">During execution the PM coordinates the team. Tell the PM who you want to talk to and about what; the PM prepares a briefing for that agent, then a discussion opens in Discuss.</p>
          <div className="form-grid">
            <Field label="Talk with">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.filter((r) => r !== "project-manager").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_FULL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Topic" span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Can the receipt endpoint stream partial results?" autoFocus />
            </Field>
          </div>
          {hold.banner}
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ settings
function SettingsDrawer({ open, onClose, view }: { open: boolean; onClose: () => void; view: WorkflowView }) {
  const live = useLive();
  const [l, setL] = useState(view.workflow.limits);
  const [r, setR] = useState(view.workflow.reports);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setL(view.workflow.limits);
      setR(view.workflow.reports);
    }
  }, [open, view]);
  const num = (k: keyof typeof l) => (e: React.ChangeEvent<HTMLInputElement>) => setL((x) => ({ ...x, [k]: Number(e.target.value) }));
  const save = async () => {
    setBusy(true);
    try {
      await api.workflowSettings(view.project, { limits: l, reports: r });
      await live.refreshWorkflow(view.project);
      live.toast("Workflow settings saved", "success");
      onClose();
    } catch (e) {
      live.toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Workflow settings"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <h3 className="h4">Limits</h3>
        <div className="form-grid">
          <Field label="Max parallel runs">
            <input type="number" min={1} max={10} value={l.maxParallel} onChange={num("maxParallel")} />
          </Field>
          <Field label="Daily budget (USD)">
            <input type="number" min={0} step={1} value={l.dailyBudgetUsd} onChange={num("dailyBudgetUsd")} />
          </Field>
          <Field label="$ per weight point">
            <input type="number" min={0} step={0.1} value={l.budgetPerWeight} onChange={num("budgetPerWeight")} />
          </Field>
          <Field label="Max per task (USD)">
            <input type="number" min={0} step={0.5} value={l.maxTaskBudgetUsd} onChange={num("maxTaskBudgetUsd")} />
          </Field>
          <Field label="PM budget per run (USD)">
            <input type="number" min={0} step={0.5} value={l.pmBudgetUsd} onChange={num("pmBudgetUsd")} />
          </Field>
          <Field label="Analyst budget per run (USD)">
            <input type="number" min={0} step={0.5} value={l.analystBudgetUsd} onChange={num("analystBudgetUsd")} />
          </Field>
          <Field label="Permission mode">
            <select value={l.permissionMode} onChange={(e) => setL((x) => ({ ...x, permissionMode: e.target.value as typeof l.permissionMode }))}>
              <option value="acceptEdits">Safe – accept edits</option>
              <option value="bypassPermissions">Full – bypass permissions</option>
            </select>
          </Field>
          <Field label="Model (empty = default)">
            <input value={l.model} onChange={(e) => setL((x) => ({ ...x, model: e.target.value }))} placeholder="CLI default" />
          </Field>
        </div>
        {l.permissionMode === "bypassPermissions" && (
          <div className="warn-box" role="alert">
            <strong>⚠ Warning:</strong> delegated runs will run any command without asking.
          </div>
        )}
        <h3 className="h4">Reports</h3>
        <div className="form-grid">
          <label className="check span-2">
            <input type="checkbox" checked={r.milestones} onChange={(e) => setR((x) => ({ ...x, milestones: e.target.checked }))} />
            Report at every milestone
          </label>
          <Field label="Daily report at" hint="HH:MM, empty = off">
            <input value={r.dailyAt} onChange={(e) => setR((x) => ({ ...x, dailyAt: e.target.value }))} placeholder="17:00" />
          </Field>
          <Field label="Every N hours" hint="0 = off">
            <input type="number" min={0} max={24} value={r.everyHours} onChange={(e) => setR((x) => ({ ...x, everyHours: Number(e.target.value) }))} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

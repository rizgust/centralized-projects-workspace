import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { PermissionMode, Role, Task } from "../api/types";
import { ROLES } from "../api/types";
import { roleLabel, useLive } from "../store";
import { Dialog, Field } from "./ui";
import { useNavigate } from "react-router-dom";

export function LaunchDialog() {
  const { launch, closeLaunch, projects, activeProject, toast } = useLive();
  const nav = useNavigate();
  const open = launch !== null;
  const [project, setProject] = useState("");
  const [role, setRole] = useState<Role>("frontend");
  const [taskId, setTaskId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PermissionMode>("acceptEdits");
  const [budget, setBudget] = useState("2");
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [model, setModel] = useState("");
  const [confirmFull, setConfirmFull] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!launch) return;
    setProject(launch.project ?? activeProject ?? projects[0]?.id ?? "");
    setRole(launch.role ?? "frontend");
    setTaskId(launch.taskId ?? "");
    setPrompt(launch.prompt ?? "");
    setMode("acceptEdits");
    setBudget("2");
    setBudgetTouched(false);
    setModel("");
    setConfirmFull(false);
    setErr(null);
  }, [launch, activeProject, projects]);

  useEffect(() => {
    if (!open || !project) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    api
      .tasks(project)
      .then((t) => !cancelled && setTasks(t.filter((x) => x.status !== "completed" && x.status !== "cancelled")))
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [open, project]);

  const chooseMode = (m: PermissionMode) => {
    setMode(m);
    if (!budgetTouched) setBudget(m === "bypassPermissions" ? "10" : "2");
    if (m === "acceptEdits") setConfirmFull(false);
  };

  const chooseTask = (id: string) => {
    setTaskId(id);
    const t = tasks.find((x) => x.id === id);
    if (t) {
      if (ROLES.includes(t.owner as Role)) setRole(t.owner as Role);
      if (!prompt.trim()) setPrompt(`Work on ${t.id}: ${t.title}. Follow the task's requirements and acceptance criteria; hand off to qa-tester when ready.`);
    }
  };

  const budgetNum = Number(budget);
  const valid = project && prompt.trim() && budgetNum > 0 && (mode === "acceptEdits" || confirmFull);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const run = await api.startRun({
        project,
        role,
        prompt: prompt.trim(),
        taskId: taskId || undefined,
        permissionMode: mode,
        budgetUsd: budgetNum,
        model: model.trim() || undefined,
      });
      toast(`Started ${roleLabel(role)} run ${run.id}`, "success");
      closeLaunch();
      nav(`/agents/runs/${encodeURIComponent(run.id)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeLaunch}
      title="Launch agent"
      wide
      footer={
        <>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          <button className="btn" onClick={closeLaunch}>
            Cancel
          </button>
          <button className={`btn ${mode === "bypassPermissions" ? "btn-danger" : "btn-primary"}`} disabled={!valid || busy} onClick={submit}>
            {busy ? "Starting…" : "Launch"}
          </button>
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="muted">Register a project first — runs need a project to work in.</p>
      ) : (
        <div className="form-grid">
          <Field label="Project">
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Task (optional)" hint="Starting a run on a backlog/ready task moves it to active.">
            <select value={taskId} onChange={(e) => chooseTask(e.target.value)}>
              <option value="">— none —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.title} ({t.status})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model (optional)" hint="Leave empty for the CLI default.">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. claude-sonnet-4-5" />
          </Field>
          <Field label="Prompt" span>
            <textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
          </Field>
          <fieldset className="span-2 perm">
            <legend>Permission mode</legend>
            <label className={`radio-card${mode === "acceptEdits" ? " on" : ""}`}>
              <input type="radio" name="perm" checked={mode === "acceptEdits"} onChange={() => chooseMode("acceptEdits")} />
              <span>
                <strong>Safe – accept edits</strong>
                <span className="muted"> File edits are auto-accepted; other tools follow your Claude Code permission settings.</span>
              </span>
            </label>
            <label className={`radio-card danger${mode === "bypassPermissions" ? " on" : ""}`}>
              <input type="radio" name="perm" checked={mode === "bypassPermissions"} onChange={() => chooseMode("bypassPermissions")} />
              <span>
                <strong>Full – bypass permissions</strong>
                <span className="muted"> The agent can run any command without asking.</span>
              </span>
            </label>
            {mode === "bypassPermissions" && (
              <div className="warn-box" role="alert">
                <strong>⚠ Warning:</strong> bypassing permissions lets the agent run shell commands, delete files and push code with no
                confirmation. Use only in a disposable worktree you can afford to lose.
                <label className="check">
                  <input type="checkbox" checked={confirmFull} onChange={(e) => setConfirmFull(e.target.checked)} />I understand the risk and
                  want to run with full permissions.
                </label>
              </div>
            )}
          </fieldset>
          <Field label="Budget (USD)" hint={mode === "bypassPermissions" ? "Default 10 for full mode." : "Default 2 for safe mode."}>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                setBudgetTouched(true);
              }}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

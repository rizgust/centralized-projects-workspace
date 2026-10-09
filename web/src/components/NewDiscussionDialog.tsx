import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Role } from "../api/types";
import { ROLES } from "../api/types";
import { ROLE_FULL, useLive } from "../store";
import { Dialog, Field } from "./ui";
import { ArrangeDialog } from "../pages/WorkflowPanel";

export function NewDiscussionDialog() {
  const live = useLive();
  const nav = useNavigate();
  const pre = live.newDiscussion;
  const [topic, setTopic] = useState("");
  const [scope, setScope] = useState<string>("");
  const [role, setRole] = useState<Role>("analyst");
  const [budget, setBudget] = useState("1");
  const [model, setModel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const [arrange, setArrange] = useState(false);
  const inExecution = !!scope && role !== "analyst" && live.workflows[scope]?.workflow.phase === "execution";

  useEffect(() => {
    if (!pre) return;
    setTopic(pre.topic ?? "");
    setScope(pre.project ?? "");
    setRole(pre.role ?? "analyst");
    setBudget("1");
    setModel("");
    setMessage("");
    setErr(null);
    setHeld(null);
    setOverride(false);
  }, [pre]);

  const hold = live.prayer?.active && live.prayer.config.holdLaunches && message.trim() ? live.prayer.active : null;
  const blocked = (!!hold || !!held) && !override;
  const valid = topic.trim() && Number(budget) > 0 && !blocked;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.newDiscussion({
        topic: topic.trim(),
        project: scope || null,
        role,
        budgetUsd: Number(budget),
        model: model.trim() || undefined,
        message: message.trim() || undefined,
        override: override || undefined,
      });
      live.closeNewDiscussion();
      nav(`/discuss?id=${encodeURIComponent(res.discussion.id)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) setHeld(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!pre}
      onClose={live.closeNewDiscussion}
      title="New discussion"
      footer={
        <>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          <button className="btn" onClick={live.closeNewDiscussion}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Starting…" : "Start discussion"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Topic" span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Integration ideas across projects" autoFocus />
        </Field>
        <Field label="Scope" hint={scope ? "The role reads this project's files." : "The Analyst can read all projects."}>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Workspace (all projects)</option>
            {live.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Talk with">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_FULL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Budget per message (USD)">
          <input type="number" min={0.1} step={0.5} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Model (optional)">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="CLI default" />
        </Field>
        <Field label="First message (optional)" span hint="Read-only (plan mode): the role reads and thinks, it doesn't change files.">
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to explore?" />
        </Field>
        {inExecution && (
          <div className="info-note span-2" role="note">
            <strong>{ROLE_FULL[role]}</strong> is working on {live.projects.find((p) => p.id === scope)?.name ?? scope}, which is in execution. During execution the PM arranges talks with the team: the PM briefs the {ROLE_FULL[role]} first, then the discussion opens.{" "}
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setArrange(true)}>
              Ask PM to arrange
            </button>
          </div>
        )}
        {(hold || held) && (
          <div className="info-box span-2" role="status">
            <strong>{hold ? `Sholat ${hold.name.charAt(0).toUpperCase() + hold.name.slice(1)} berjamaah` : "Sholat in progress"}</strong>
            <span>{hold ? `Messages are held until ${new Date(hold.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.` : held}</span>
            <label className="check">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Send anyway (override the sholat hold)
            </label>
          </div>
        )}
      </div>
      {scope && (
        <ArrangeDialog
          open={arrange}
          onClose={() => {
            setArrange(false);
            live.closeNewDiscussion();
          }}
          project={scope}
          role={role}
          topic={topic}
        />
      )}
    </Dialog>
  );
}

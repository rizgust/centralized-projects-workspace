import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Question } from "../api/types";
import { ROLE_FULL, roleLabel, useLive } from "../store";
import { ago } from "../fmt";
import { PixelAvatar } from "./PixelAvatar";
import { Dialog } from "./ui";
import { DelegationCard } from "../pages/WorkflowPanel";

/** Owner inbox: open questions from agents, answered in place (optionally resuming the run). */
export function InboxDrawer() {
  const live = useLive();
  const open = live.questions.filter((q) => q.status === "open");
  const approvals = Object.values(live.workflows).flatMap((w) => w.delegations.filter((d) => d.status === "proposed").map((d) => ({ project: w.project, d })));
  const focus = typeof live.inbox === "string" ? live.inbox : null;
  const ordered = focus ? [...open].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0)) : open;
  const [done, setDone] = useState<{ q: Question; runId: string | null }[]>([]);
  useEffect(() => {
    if (live.inbox === false) setDone([]);
  }, [live.inbox]);

  return (
    <Dialog
      open={live.inbox !== false}
      onClose={live.closeInbox}
      variant="drawer"
      title={
        <span>
          Owner inbox <span className="muted small">{open.length} questions · {approvals.length} approvals</span>
        </span>
      }
    >
      <div className="stack">
        {done.map(({ q, runId }) => (
          <div key={q.id} className="answered-note" role="status">
            ✓ Answered {ROLE_FULL[q.from] ?? q.from}
            {runId ? (
              <>
                {" "}
                · Resumed as run <Link to={`/agents/runs/${encodeURIComponent(runId)}`} onClick={live.closeInbox}>{runId}</Link>
              </>
            ) : null}
          </div>
        ))}
        {(approvals.length > 0 || live.inbox === "dlg") && (
          <section className="stack-sm" aria-label="Approvals">
            <h3 className="inbox-sec">Approvals</h3>
            {approvals.length === 0 && <p className="muted small">No delegation proposals waiting.</p>}
            {approvals.map(({ project, d }) => (
              <div key={project + d.id} className="stack-sm">
                <span className="muted small">
                  {live.projects.find((p) => p.id === project)?.name ?? project} ·{" "}
                  <Link to={`/projects/${encodeURIComponent(project)}`} onClick={live.closeInbox}>
                    open workflow
                  </Link>
                </span>
                <DelegationCard project={project} d={d} compact />
              </div>
            ))}
          </section>
        )}
        <h3 className="inbox-sec">Questions</h3>
        {ordered.length === 0 && <p className="muted">No open questions. The team isn't waiting on you.</p>}
        {ordered.map((q) => (
          <QuestionCard key={q.id} q={q} onDone={(runId) => setDone((d) => [{ q, runId }, ...d])} />
        ))}
      </div>
    </Dialog>
  );
}

function QuestionCard({ q, onDone }: { q: Question; onDone: (runId: string | null) => void }) {
  const live = useLive();
  const [answer, setAnswer] = useState("");
  const [resume, setResume] = useState(!!q.sessionId);
  const [override, setOverride] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const project = live.projects.find((p) => p.id === q.project);
  const hold = resume && live.prayer?.active && live.prayer.config.holdLaunches ? live.prayer.active : null;
  const holdUntil = hold ? new Date(hold.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : null;

  const send = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.answerQuestion(q.id, { answer: text.trim(), resume: resume || undefined, override: override || undefined });
      live.toast(res.run ? `Answered — resumed as run ${res.run.id}` : `Answered ${ROLE_FULL[q.from] ?? q.from}`, "success");
      onDone(res.run?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) setHeld(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async () => {
    setBusy(true);
    try {
      await api.dismissQuestion(q.id);
      live.toast("Question dismissed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const blocked = (!!hold || !!held) && resume && !override;

  return (
    <article className="card question-card">
      <header className="q-head">
        <PixelAvatar role={q.from} project={q.project} scale={3} />
        <div>
          <strong>{ROLE_FULL[q.from] ?? roleLabel(q.from)}</strong>
          <div className="muted small">
            {project?.name ?? q.project}
            {q.task && (
              <>
                {" · "}
                <Link to={`/tasks?project=${encodeURIComponent(q.project)}`} onClick={live.closeInbox}>
                  {q.task}
                </Link>
              </>
            )}
            {" · "}asked {ago(q.askedAt)}
          </div>
          {q.source === "auto" && <span className="badge">detected from the agent's last message</span>}
        </div>
      </header>
      <p className="q-text">{q.question}</p>
      {q.context && <p className="q-context">{q.context}</p>}
      {q.options.length > 0 && (
        <div className="row-wrap" role="group" aria-label="Quick answers">
          {q.options.map((o) => (
            <button key={o} className="btn btn-sm" disabled={busy || blocked} onClick={() => void send(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span className="field-label">Your answer</span>
        <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type an answer…" />
      </label>
      <label className="check">
        <input type="checkbox" checked={resume} disabled={!q.sessionId} onChange={(e) => setResume(e.target.checked)} />
        Resume the agent with this answer{!q.sessionId && <span className="muted small"> (no session to resume)</span>}
      </label>
      {(hold || held) && resume && (
        <div className="info-box" role="status">
          <strong>{hold ? `Sholat ${hold.name.charAt(0).toUpperCase() + hold.name.slice(1)} berjamaah` : "Sholat in progress"}</strong>
          <span>{hold ? `Resuming agents is held until ${holdUntil}.` : held}</span>
          <label className="check">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Resume anyway (override the sholat hold)
          </label>
        </div>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <footer className="row-wrap q-foot">
        <button className="btn" disabled={busy} onClick={dismiss}>
          Dismiss
        </button>
        <button className="btn btn-primary" disabled={busy || !answer.trim() || blocked} onClick={() => void send(answer)}>
          {busy ? "Sending…" : "Answer"}
        </button>
      </footer>
    </article>
  );
}

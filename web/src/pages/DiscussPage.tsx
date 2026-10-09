import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Discussion, DiscussionSummary, DiscussionTurn, Role } from "../api/types";
import { ROLES } from "../api/types";
import { ROLE_FULL, roleLabel, useLive, useRunEvents } from "../store";
import { PixelAvatar } from "../components/PixelAvatar";
import { Empty, Markdown } from "../components/ui";
import { ago, usd } from "../fmt";
import { CreateTaskDialog } from "./TasksPage";

export function DiscussPage() {
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const sel = params.get("id") ?? live.discussions.find((d) => d.status === "open")?.id ?? live.discussions[0]?.id ?? null;
  const open = live.discussions.filter((d) => d.status === "open");
  const closed = live.discussions.filter((d) => d.status === "closed");

  return (
    <div className="discuss">
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Discuss</h1>
          <p className="muted">Brainstorm with the Analyst (or any role). Replies are read-only plan-mode runs on one Claude session.</p>
        </div>
        <button className="btn btn-primary" onClick={() => live.openNewDiscussion({ role: "analyst" })}>
          + New discussion
        </button>
      </div>
      <div className="discuss-grid">
        <nav className="disc-list" aria-label="Discussions">
          {live.discussions.length === 0 && <p className="muted small">No discussions yet.</p>}
          {[
            ["Open", open],
            ["Closed", closed],
          ].map(([label, list]) =>
            (list as DiscussionSummary[]).length ? (
              <div key={label as string}>
                <h2 className="disc-group">{label as string}</h2>
                <ul className="plain">
                  {(list as DiscussionSummary[]).map((d) => (
                    <li key={d.id}>
                      <button className={`disc-item${sel === d.id ? " on" : ""}`} onClick={() => setParams({ id: d.id })} aria-current={sel === d.id}>
                        <PixelAvatar role={d.role} project={d.project} scale={2} />
                        <span className="disc-text">
                          <span className="disc-topic">{d.topic}</span>
                          <span className="row-wrap disc-meta">
                            <span className="badge">{d.project ? (live.projects.find((p) => p.id === d.project)?.name ?? d.project) : "Workspace"}</span>
                            <span className="muted small">{ago(d.updatedAt)}</span>
                            {d.running && <span className="live-dot on"><span aria-hidden="true" /> replying</span>}
                          </span>
                          <span className="disc-last muted small">{d.lastMessage
                              .split("\n")
                              .filter((l) => !/^\s*\|?\s*-{3,}/.test(l))
                              .join(" ")
                              .replace(/[#*>|`]/g, "")
                              .replace(/\s+/g, " ")
                              .slice(0, 90)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </nav>
        {sel ? <Chat id={sel} /> : <Empty title="Start a discussion"><p className="muted">Pick one on the left or start a new one.</p></Empty>}
      </div>
    </div>
  );
}

function Chat({ id }: { id: string }) {
  const live = useLive();
  const summary = live.discussions.find((d) => d.id === id);
  const [d, setD] = useState<Discussion | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [override, setOverride] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // refetch whenever the summary changes (new turn, reply, close/reopen)
  const stamp = summary ? `${summary.updatedAt}|${summary.turns}|${summary.running}|${summary.status}` : "";
  useEffect(() => {
    let cancelled = false;
    api
      .discussion(id)
      .then((x) => !cancelled && setD(x))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id, stamp]);
  useEffect(() => {
    setText("");
    setHeld(null);
    setOverride(false);
    setErr(null);
  }, [id]);

  const running = summary?.running ?? d?.running ?? null;
  const events = useRunEvents(running);
  const lastTool = [...events].reverse().find((e) => e.kind === "tool_use");
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [d?.turns.length, running, lastTool?.seq]);

  const hold = live.prayer?.active && live.prayer.config.holdLaunches ? live.prayer.active : null;
  const blocked = (!!hold || !!held) && !override;

  const act = async (fn: () => Promise<{ discussion: Discussion }>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fn();
      setD(res.discussion);
      setHeld(null);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) setHeld(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const t = text.trim();
    if (!t || running || blocked) return;
    if (await act(() => api.sendMessage(id, t, override))) setText("");
  };
  const wrapup = () => void act(() => api.wrapup(id, override));
  const toggle = async () => {
    if (!d) return;
    try {
      setD(d.status === "open" ? await api.closeDiscussion(id) : await api.reopenDiscussion(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!d) return <section className="chat card">{err ? <p className="form-error">{err}</p> : <p className="muted">Loading…</p>}</section>;
  const projectName = d.project ? (live.projects.find((p) => p.id === d.project)?.name ?? d.project) : "Workspace";
  const verb = (tool?: string) => (tool === "Read" ? "reading" : tool === "Grep" || tool === "Glob" ? "searching" : tool === "Bash" ? "running" : tool === "WebFetch" || tool === "WebSearch" ? "browsing" : (tool ?? "working").toLowerCase());

  return (
    <section className="chat card" aria-label={`Discussion: ${d.topic}`}>
      <header className="chat-head">
        <PixelAvatar role={d.role} project={d.project} scale={3} />
        <div className="chat-title">
          <h2>{d.topic}</h2>
          <p className="muted small">
            {ROLE_FULL[d.role] ?? roleLabel(d.role)} · <span className="badge">{projectName}</span> · {usd(d.costUsd)} so far · budget {usd(d.budgetUsd)}/message
            {d.status === "closed" && <span className="badge"> closed</span>}
          </p>
        </div>
        <div className="row-wrap">
          <button className="btn btn-sm" disabled={!!running || busy || d.turns.length === 0 || blocked} onClick={wrapup}>
            Wrap up
          </button>
          <button className="btn btn-sm btn-ghost" disabled={!!running} onClick={toggle}>
            {d.status === "open" ? "Close" : "Reopen"}
          </button>
        </div>
      </header>

      <div className="chat-log" ref={scroller} aria-live="polite">
        {d.turns.length === 0 && <p className="muted center">Say hello — ask about integrations, risks, ideas…</p>}
        {d.turns.map((t, i) => (
          <Turn key={i} t={t} d={d} />
        ))}
        {running && (
          <div className="msg agent typing">
            <PixelAvatar role={d.role} project={d.project} scale={2} />
            <div className="bubble-agent">
              <span className="dots" aria-label={`${roleLabel(d.role)} is typing`}>
                <span />
                <span />
                <span />
              </span>
              {lastTool && (
                <span className="muted small tool-line">
                  {verb(lastTool.tool)} {lastTool.text.split("\n")[0].slice(0, 60)}…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {(hold || held) && (
        <div className="info-box" role="status">
          <strong>{hold ? `Sholat ${hold.name.charAt(0).toUpperCase() + hold.name.slice(1)} berjamaah` : "Sholat in progress"}</strong>
          <span>{hold ? `Messages are held until ${new Date(hold.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.` : held}</span>
          <label className="check">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Send anyway (override the sholat hold)
          </label>
        </div>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="composer">
        <label className="sr-only" htmlFor="composer">
          Message
        </label>
        <textarea
          id="composer"
          rows={2}
          value={text}
          disabled={!!running}
          placeholder={running ? `${roleLabel(d.role)} is replying…` : "Message — Enter to send, Shift+Enter for a new line"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn btn-primary" disabled={!text.trim() || !!running || busy || blocked} onClick={() => void send()}>
          Send
        </button>
      </div>
    </section>
  );
}

function Turn({ t, d }: { t: DiscussionTurn; d: Discussion }) {
  if (t.who === "owner")
    return (
      <div className="msg owner">
        <div className="bubble-owner">{t.text}</div>
        <time className="muted small">{ago(t.at)}</time>
      </div>
    );
  return (
    <div className={`msg agent${t.error ? " err" : ""}`}>
      <PixelAvatar role={d.role} project={d.project} scale={2} />
      <div className="msg-body">
        {t.wrapup ? <WrapupCard text={t.text} d={d} /> : <div className="bubble-agent"><Markdown source={t.text} /></div>}
        <time className="muted small">
          {ago(t.at)}
          {t.runId && (
            <>
              {" · "}
              <Link to={`/agents/runs/${encodeURIComponent(t.runId)}`}>{t.runId}</Link>
            </>
          )}
        </time>
      </div>
    </div>
  );
}

const SECTIONS = ["Summary", "Ideas", "Decisions", "Next steps", "Open questions"];

interface Step {
  role: Role | null;
  action: string;
  project: string | null;
  raw: string;
}

function parseWrapup(text: string) {
  const parts = new Map<string, string>();
  let cur = "Summary";
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,4}\s*(.+?)\s*$/);
    if (h) {
      const title = SECTIONS.find((s) => s.toLowerCase() === h[1].toLowerCase().replace(/:$/, "")) ?? h[1];
      cur = title;
      continue;
    }
    parts.set(cur, (parts.get(cur) ?? "") + line + "\n");
  }
  const steps: Step[] = [];
  for (const line of (parts.get("Next steps") ?? "").split("\n")) {
    const m = line.match(/^\s*[-*]\s*(?:\[([\w-]+)\]\s*)?(.+?)\s*(?:\(([\w-]+)\))?\s*$/);
    if (!m) continue;
    const role = ROLES.includes(m[1] as Role) ? (m[1] as Role) : null;
    steps.push({ role, action: m[2], project: m[3] ?? null, raw: line });
  }
  return { parts, steps };
}

function WrapupCard({ text, d }: { text: string; d: Discussion }) {
  const live = useLive();
  const { parts, steps } = useMemo(() => parseWrapup(text), [text]);
  const [task, setTask] = useState<Step | null>(null);
  const [created, setCreated] = useState<Record<string, string>>({});
  const projectFor = (s: Step) => s.project ?? d.project ?? live.activeProject ?? "";
  return (
    <>
    <article className="wrapup" aria-label="Discussion wrap-up">
      <header className="wrapup-head">
        <span className="pixel-title small-title">Wrap-up</span>
      </header>
      {SECTIONS.filter((s) => s !== "Next steps" && s !== "Open questions" && parts.get(s)?.trim()).map((s) => (
        <section key={s} className="wrapup-sec">
          <h3>{s}</h3>
          <Markdown source={parts.get(s)!} />
        </section>
      ))}
      {steps.length > 0 && (
        <section className="wrapup-sec">
          <h3>Next steps</h3>
          <ul className="plain steps">
            {steps.map((s) => {
              const p = projectFor(s);
              return (
                <li key={s.raw} className="step">
                  {s.role && (
                    <span className="badge">
                      <PixelAvatar role={s.role} project={p || null} scale={1} /> {roleLabel(s.role)}
                    </span>
                  )}
                  <span className="step-text">
                    {s.action}
                    {s.project && <span className="muted small"> · {s.project}</span>}
                  </span>
                  {created[s.raw] ? (
                    <span className="badge">✓ {created[s.raw]}</span>
                  ) : (
                    <button className="btn btn-sm" disabled={!p || !live.projects.some((x) => x.id === p)} title={p ? `Create a task in ${p}` : "No project to create the task in"} onClick={() => setTask(s)}>
                      + Create task
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {parts.get("Open questions")?.trim() && (
        <section className="wrapup-sec">
          <h3>Open questions</h3>
          <Markdown source={parts.get("Open questions")!} />
        </section>
      )}
    </article>
      <CreateTaskDialog
        open={!!task}
        project={task ? projectFor(task) : ""}
        features={[]}
        prefill={task ? { title: task.action, owner: task.role ?? "analyst", description: `From discussion "${d.topic}" (${d.id}).` } : undefined}
        onClose={() => setTask(null)}
        onCreated={(t) => {
          setCreated((c) => ({ ...c, [task!.raw]: t.id }));
          live.toast(`Created ${t.id} in ${t.project}`, "success");
          setTask(null);
        }}
      />
    </>
  );
}

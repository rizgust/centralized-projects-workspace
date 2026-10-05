import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Usage, UsageRow } from "../api/types";
import { useLive } from "../store";
import { ChartCard, HBars, Legend, StackedColumns, type Series } from "../components/charts";
import { ago, compact, num, usd } from "../fmt";

const RANGES = [7, 30, 90] as const;

const TOKEN_SERIES: Series[] = [
  { id: "input", label: "Input", color: "var(--series-1)" },
  { id: "output", label: "Output", color: "var(--series-2)" },
  { id: "cacheWrite", label: "Cache write", color: "var(--series-3)" },
  { id: "cacheRead", label: "Cache read", color: "var(--series-4)" },
];
const COST_SERIES: Series[] = [{ id: "cost", label: "API-equivalent cost", color: "var(--series-1)" }];

const tok = (r: UsageRow) => r.input + r.output + r.cacheRead + r.cacheWrite;
const cacheHit = (r: UsageRow) => {
  const d = r.input + r.cacheRead + r.cacheWrite;
  return d > 0 ? r.cacheRead / d : 0;
};
const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });

export function UsagePage() {
  const live = useLive();
  const [days, setDays] = useState<number>(30);
  const [u, setU] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .usage(days)
      .then((d) => !cancelled && (setU(d), setErr(null)))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const today = live.usageToday ?? u?.today ?? null;

  const tokenData = useMemo(
    () =>
      (u?.byDay ?? []).map((d) => ({
        key: d.date,
        label: dayLabel(d.date),
        values: { input: d.input, output: d.output, cacheWrite: d.cacheWrite, cacheRead: d.cacheRead },
      })),
    [u],
  );
  const costData = useMemo(() => (u?.byDay ?? []).map((d) => ({ key: d.date, label: dayLabel(d.date), values: { cost: d.costUsd } })), [u]);

  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else if (n.size < TOKEN_SERIES.length - 1) n.add(id);
      return n;
    });

  const costNote = u ? `API-equivalent estimate (pricing checked ${u.pricingCheckedAt}). A subscription isn't billed per token.` : "API-equivalent estimate.";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="pixel-title">Usage</h1>
          <p className="muted">Token usage across the workspace{u ? ` · ${u.from.slice(0, 10)} → ${u.to.slice(0, 10)}` : ""}</p>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Date range">
        <div className="seg" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={days === r} className={`seg-btn${days === r ? " on" : ""}`} onClick={() => setDays(r)}>
              {days === r && <span aria-hidden="true">✓ </span>}Last {r} days
            </button>
          ))}
        </div>
        {loading && <span className="muted small">Refreshing…</span>}
      </div>

      {err && <p className="form-error">{err}</p>}
      {!u ? (
        !err && <p className="muted">Loading…</p>
      ) : (
        <div className={`usage-body${loading ? " refetching" : ""}`}>
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-label">Tokens today</span>
              <span className="kpi-value">{today ? compact(tok(today)) : "—"}</span>
              <span className="kpi-sub">{today ? `${num(today.messages)} messages · ${usd(today.costUsd)} API-eq.` : ""}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Tokens, last {days} days</span>
              <span className="kpi-value">{compact(tok(u.totals))}</span>
              <span className="kpi-sub">
                in {compact(u.totals.input)} · out {compact(u.totals.output)}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">API-equivalent cost, {days} days</span>
              <span className="kpi-value">{usd(u.totals.costUsd)}</span>
              <span className="kpi-sub">estimate · pricing checked {u.pricingCheckedAt}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Cache hit ratio</span>
              <span className="kpi-value">{(cacheHit(u.totals) * 100).toFixed(1)}%</span>
              <span className="kpi-sub">cache read ÷ (input + cache read + cache write)</span>
            </div>
          </div>

          <ChartCard
            title="Daily tokens by type"
            subtitle="Cache reads usually dwarf the rest — click a legend item to hide it and rescale."
            table={
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Input</th>
                    <th className="num">Output</th>
                    <th className="num">Cache write</th>
                    <th className="num">Cache read</th>
                    <th className="num">Messages</th>
                    <th className="num">API-eq. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[...u.byDay].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td className="num">{num(d.input)}</td>
                      <td className="num">{num(d.output)}</td>
                      <td className="num">{num(d.cacheWrite)}</td>
                      <td className="num">{num(d.cacheRead)}</td>
                      <td className="num">{num(d.messages)}</td>
                      <td className="num">{usd(d.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <Legend series={TOKEN_SERIES} hidden={hidden} onToggle={toggle} />
            <StackedColumns data={tokenData} series={TOKEN_SERIES} hidden={hidden} format={compact} ariaLabel={`Daily tokens by type, last ${days} days`} height={240} />
          </ChartCard>

          <ChartCard title="Daily API-equivalent cost" subtitle={costNote}>
            <StackedColumns data={costData} series={COST_SERIES} format={(n) => usd(n, n < 10 ? 2 : 0)} ariaLabel={`Daily API-equivalent cost, last ${days} days`} height={180} />
          </ChartCard>

          <div className="two-col">
            <ChartCard
              title="By model"
              subtitle="API-equivalent cost"
              table={
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Tokens</th>
                      <th className="num">Messages</th>
                      <th className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.byModel.map((m) => (
                      <tr key={m.model}>
                        <td>{m.model}</td>
                        <td className="num">{num(tok(m))}</td>
                        <td className="num">{num(m.messages)}</td>
                        <td className="num">{usd(m.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <HBars rows={u.byModel.map((m) => ({ label: m.model, value: m.costUsd }))} format={(n) => usd(n)} sub={(i) => `${compact(tok(u.byModel[i]))} tok`} ariaLabel="Cost by model" />
            </ChartCard>
            <ChartCard
              title="By project"
              subtitle="API-equivalent cost"
              table={
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className="num">Tokens</th>
                      <th className="num">Messages</th>
                      <th className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.byProject.map((m) => (
                      <tr key={m.project}>
                        <td>{m.project}</td>
                        <td className="num">{num(tok(m))}</td>
                        <td className="num">{num(m.messages)}</td>
                        <td className="num">{usd(m.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <HBars rows={u.byProject.map((m) => ({ label: m.project, value: m.costUsd }))} format={(n) => usd(n)} sub={(i) => `${compact(tok(u.byProject[i]))} tok`} ariaLabel="Cost by project" />
            </ChartCard>
          </div>

          <section className="card">
            <h2 className="h3">Top sessions</h2>
            <p className="muted small">{costNote}</p>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Project</th>
                    <th>Source</th>
                    <th>Model</th>
                    <th>Last activity</th>
                    <th className="num">Messages</th>
                    <th className="num">Tokens</th>
                    <th className="num">Cache hit</th>
                    <th className="num">API-eq. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {u.topSessions.map((s) => {
                    const t = { ...s.tokens, costUsd: s.costUsd, messages: s.messages };
                    return (
                      <tr key={s.id}>
                        <td>
                          <code title={s.cwd}>{s.id.slice(0, 8)}</code> {s.live && <span className="live-dot on"><span aria-hidden="true" /> live</span>}
                        </td>
                        <td>{s.project}</td>
                        <td>{s.runId ? <Link to={`/agents/runs/${encodeURIComponent(s.runId)}`}>run {s.runId}</Link> : s.source}</td>
                        <td className="small">{s.model}</td>
                        <td>{ago(s.lastActivity)}</td>
                        <td className="num">{num(s.messages)}</td>
                        <td className="num">{compact(tok(t))}</td>
                        <td className="num">{(cacheHit(t) * 100).toFixed(0)}%</td>
                        <td className="num">{usd(s.costUsd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

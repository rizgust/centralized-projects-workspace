import { Link } from "react-router-dom";
import { useLive } from "../store";
import { ChartCard, Legend, LineChart, Meter, StackedColumns, type Series } from "../components/charts";
import { num, uptime } from "../fmt";

const LINE_SERIES: Series[] = [
  { id: "cpu", label: "CPU", color: "var(--series-1)" },
  { id: "mem", label: "Memory", color: "var(--series-2)" },
];

export function SystemPage() {
  const { system, sysPoints, runs } = useLive();
  if (!system) return <p className="muted">Loading…</p>;
  const cpu = system.cpu.percent;
  const sev = cpu >= 90 ? "critical" : cpu >= 75 ? "warning" : "ok";
  const times = sysPoints.map((p) => p.t);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="pixel-title">System</h1>
          <p className="muted">
            {system.host.hostname} · {system.host.os} · up {uptime(system.host.uptimeSec)}
          </p>
        </div>
      </div>

      <div className="sys-top">
        <section className="card hero-card" aria-label="CPU now">
          <span className="kpi-label">CPU now</span>
          <span className="hero-value">{cpu.toFixed(0)}%</span>
          <span className={`small sev-${sev}`}>{sev === "critical" ? "▲ very high load" : sev === "warning" ? "▲ elevated load" : "● normal load"}</span>
          <span className="muted small">
            {system.cpu.model} · {system.cpu.cores} logical cores
          </span>
          <div className="hero-meter">
            <Meter value={system.mem.percent} label="Memory" detail={`${num(system.mem.usedMB)} MB of ${num(system.mem.totalMB)} MB used`} />
          </div>
        </section>

        <ChartCard
          title="Last 15 minutes"
          subtitle="Sampled every 2 s"
          table={
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th className="num">CPU %</th>
                  <th className="num">Memory %</th>
                </tr>
              </thead>
              <tbody>
                {[...sysPoints]
                  .reverse()
                  .filter((_, i) => i % 15 === 0)
                  .map((p) => (
                    <tr key={p.t}>
                      <td>{new Date(p.t).toLocaleTimeString()}</td>
                      <td className="num">{p.cpu.toFixed(1)}</td>
                      <td className="num">{p.mem.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          }
        >
          <Legend series={LINE_SERIES} />
          <LineChart
            times={times}
            series={[
              { ...LINE_SERIES[0], values: sysPoints.map((p) => p.cpu) },
              { ...LINE_SERIES[1], values: sysPoints.map((p) => p.mem) },
            ]}
            ariaLabel="CPU and memory percent over the last 15 minutes"
            height={240}
          />
        </ChartCard>
      </div>

      <div className="two-col">
        <ChartCard
          title="Per-core load"
          subtitle="Current sample"
          table={
            <table className="tbl">
              <thead>
                <tr>
                  <th>Core</th>
                  <th className="num">Load %</th>
                </tr>
              </thead>
              <tbody>
                {system.cpu.perCore.map((v, i) => (
                  <tr key={i}>
                    <td>Core {i}</td>
                    <td className="num">{v.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <StackedColumns
            data={system.cpu.perCore.map((v, i) => ({ key: String(i), label: `C${i}`, values: { load: v } }))}
            series={[{ id: "load", label: "Load", color: "var(--series-1)" }]}
            format={(n) => `${Math.round(n)}%`}
            yMax={100}
            ariaLabel="Per-core CPU load"
            height={200}
          />
        </ChartCard>

        <section className="card">
          <h2 className="h3">Host</h2>
          <dl className="kv">
            <dt>Hostname</dt>
            <dd>{system.host.hostname}</dd>
            <dt>OS</dt>
            <dd>{system.host.os}</dd>
            <dt>Uptime</dt>
            <dd>{uptime(system.host.uptimeSec)}</dd>
            <dt>CPU</dt>
            <dd>
              {system.cpu.model} ({system.cpu.cores} cores)
            </dd>
            <dt>Memory</dt>
            <dd>
              {num(system.mem.usedMB)} / {num(system.mem.totalMB)} MB ({system.mem.percent.toFixed(0)}%)
            </dd>
            <dt>Sampled</dt>
            <dd>{new Date(system.t).toLocaleTimeString()}</dd>
          </dl>
        </section>
      </div>

      <section className="card">
        <h2 className="h3">Claude processes</h2>
        {system.processes.length === 0 ? (
          <p className="muted">No Claude processes running.</p>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num">PID</th>
                  <th>Name</th>
                  <th>Kind</th>
                  <th className="num">CPU %</th>
                  <th className="num">RSS MB</th>
                  <th>Linked run</th>
                  <th>Command</th>
                </tr>
              </thead>
              <tbody>
                {system.processes.map((p) => {
                  const run = p.runId ? runs.find((r) => r.id === p.runId) : null;
                  return (
                    <tr key={p.pid}>
                      <td className="num">{p.pid}</td>
                      <td>{p.name}</td>
                      <td>{p.kind === "run" ? <span className="badge">run</span> : <span className="badge">interactive</span>}</td>
                      <td className="num">{p.cpu.toFixed(1)}</td>
                      <td className="num">{num(p.rssMB)}</td>
                      <td>
                        {p.runId ? (
                          <Link to={`/agents/runs/${encodeURIComponent(p.runId)}`}>
                            {p.runId}
                            {run ? ` (${run.role})` : ""}
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <code className="small truncate block" title={p.cmd}>
                          {p.cmd}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

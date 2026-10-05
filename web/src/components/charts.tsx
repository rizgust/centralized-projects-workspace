// Hand-rolled SVG charts. Spec (dataviz skill): bars <= 24px with a 4px rounded data-end,
// square at the baseline; 2px surface gap between stacked segments; 2px lines; hairline
// solid gridlines; legend for >= 2 series; tooltip on hover AND keyboard focus; text in
// text tokens (never the series colour); every chart has a table twin.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Rect with only the top corners rounded (data-end), square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export interface Series {
  id: string;
  label: string;
  color: string; // CSS colour / var()
}

export function ChartCard({ title, subtitle, children, table, actions }: { title: string; subtitle?: ReactNode; children: ReactNode; table?: ReactNode; actions?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card chart-card">
      <header className="chart-head">
        <div>
          <h2 className="h3">{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <div className="row-wrap">
          {actions}
          {table && (
            <button className="btn btn-sm btn-ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Chart view" : "Table view"}
            </button>
          )}
        </div>
      </header>
      {showTable && table ? <div className="table-wrap chart-table">{table}</div> : children}
    </section>
  );
}

export function Legend({ series, hidden, onToggle }: { series: Series[]; hidden?: Set<string>; onToggle?: (id: string) => void }) {
  return (
    <ul className="legend" aria-label="Legend">
      {series.map((s) => {
        const off = hidden?.has(s.id);
        const swatch = <span className="swatch" style={{ background: s.color }} aria-hidden="true" />;
        return (
          <li key={s.id}>
            {onToggle ? (
              <button className={`legend-btn${off ? " off" : ""}`} aria-pressed={!off} onClick={() => onToggle(s.id)} title={off ? `Show ${s.label}` : `Hide ${s.label}`}>
                {swatch}
                {s.label}
              </button>
            ) : (
              <span className="legend-item">
                {swatch}
                {s.label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ stacked / single columns
export interface ColumnDatum {
  key: string;
  label: string; // axis label
  values: Record<string, number>;
}

export function StackedColumns({
  data,
  series,
  hidden,
  format,
  height = 220,
  ariaLabel,
  yMax,
}: {
  yMax?: number;
  data: ColumnDatum[];
  series: Series[];
  hidden?: Set<string>;
  format: (n: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const vis = series.filter((s) => !hidden?.has(s.id));
  const totals = data.map((d) => vis.reduce((a, s) => a + (d.values[s.id] ?? 0), 0));
  const max = Math.max(0, ...totals);
  const ticks = yMax ? [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax] : niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const left = 52;
  const right = 8;
  const plotTop = 8;
  const axisBand = 22;
  const plotH = height - plotTop - axisBand;
  const plotW = Math.max(0, width - left - right);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => plotTop + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56))));

  const onKey = (e: React.KeyboardEvent) => {
    if (!data.length) return;
    if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? data.length) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(data.length - 1);
    else return;
    e.preventDefault();
  };

  const tipD = active !== null ? data[active] : null;
  const tipX = active !== null ? left + band * active + band / 2 : 0;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${ariaLabel}. Use arrow keys to read values.`}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? data.length - 1)}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="chart-svg"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className={t === 0 ? "axis-line" : "grid-line"} />
              <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tick">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = left + band * i + (band - barW) / 2;
            let acc = 0;
            const segs = vis
              .map((s) => ({ s, v: d.values[s.id] ?? 0 }))
              .filter((p) => p.v > 0);
            return (
              <g key={d.key} opacity={active === null || active === i ? 1 : 0.55}>
                {segs.map((p, k) => {
                  const y0 = y(acc);
                  acc += p.v;
                  const y1 = y(acc);
                  const isTop = k === segs.length - 1;
                  // 2px surface gap between stacked segments
                  const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));
                  const yy = y1;
                  return isTop ? (
                    <path key={p.s.id} d={topRounded(x, yy, barW, h, 4)} fill={p.s.color} />
                  ) : (
                    <rect key={p.s.id} x={x} y={yy} width={barW} height={h} fill={p.s.color} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={left + band * i + band / 2} y={height - 6} textAnchor="middle" className="tick">
                    {d.label}
                  </text>
                )}
                {/* hit target: the whole band, taller than the mark */}
                <rect x={left + band * i} y={plotTop} width={band} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {tipD && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(tipX, 90), width - 90), top: 4 }} role="status">
          <div className="tip-head">{tipD.label}</div>
          {vis.length > 1 && (
            <div className="tip-row tip-total">
              <strong>{format(totals[active!])}</strong> total
            </div>
          )}
          {[...vis].reverse().map((s) => (
            <div key={s.id} className="tip-row">
              <span className="tip-key" style={{ background: s.color }} aria-hidden="true" />
              <strong>{format(tipD.values[s.id] ?? 0)}</strong> <span className="muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ horizontal bars
export function HBars({ rows, format, sub, ariaLabel, color = "var(--series-1)" }: { rows: { label: string; value: number }[]; format: (n: number) => string; sub?: (i: number) => string; ariaLabel: string; color?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
  const [active, setActive] = useState<number | null>(null);
  return (
    <ul className="hbars" aria-label={ariaLabel}>
      {rows.map((r, i) => (
        <li key={r.label} className={`hbar${active === i ? " on" : ""}`} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} tabIndex={0} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
          <span className="hbar-label" title={r.label}>
            {r.label}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%`, background: color }} aria-hidden="true" />
          </span>
          <span className="hbar-value">
            <strong>{format(r.value)}</strong>
            {sub && <span className="muted small"> {sub(i)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ line chart (0..100 %)
export interface LineSeries extends Series {
  values: number[];
}

export function LineChart({ times, series, height = 220, ariaLabel, yMax = 100, unit = "%" }: { times: string[]; series: LineSeries[]; height?: number; ariaLabel: string; yMax?: number; unit?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const left = 40;
  const right = 56; // room for end labels
  const top = 10;
  const axisBand = 22;
  const plotH = height - top - axisBand;
  const plotW = Math.max(0, width - left - right);
  const n = times.length;
  const x = (i: number) => left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => top + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  const ticks = [0, 25, 50, 75, 100].map((t) => (t * yMax) / 100);
  const tLabels = n ? [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1] : [];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - left) / Math.max(1, plotW)) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
    else return;
    e.preventDefault();
  };
  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // end labels: nudge apart only if they would overlap (leader-free, small offset)
  const ends = series.map((s) => ({ s, v: s.values[s.values.length - 1] ?? 0 })).map((e) => ({ ...e, y: y(e.v) }));
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} className="chart-svg" role="img" aria-label={`${ariaLabel}. Use arrow keys to read values.`} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setActive(null)} onKeyDown={onKey} onFocus={() => setActive((a) => a ?? n - 1)} onBlur={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? "axis-line" : "grid-line"} />
              <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tick">
                {t}
                {unit}
              </text>
            </g>
          ))}
          {tLabels.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="tick">
              {fmtT(times[i])}
            </text>
          ))}
          {series.map((s, si) => (
            <g key={s.id}>
              {si === 0 && <path d={`M${x(0)},${y(0)} ${s.values.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${y(0)} Z`} fill={s.color} opacity={0.1} />}
              <path d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          ))}
          {ends.map((e) => (
            <text key={e.s.id} x={left + plotW + 8} y={e.y} dy="0.32em" className="end-label">
              {Math.round(e.v)}
              {unit} {e.s.label}
            </text>
          ))}
          {active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={top} y2={top + plotH} className="crosshair" />
              {series.map((s) => (
                <circle key={s.id} cx={x(active)} cy={y(s.values[active] ?? 0)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
      {active !== null && n > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: 4 }} role="status">
          <div className="tip-head">{new Date(times[active]).toLocaleTimeString()}</div>
          {series.map((s) => (
            <div key={s.id} className="tip-row">
              <span className="tip-key" style={{ background: s.color }} aria-hidden="true" />
              <strong>
                {(s.values[active] ?? 0).toFixed(1)}
                {unit}
              </strong>{" "}
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ meter
export function Meter({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const sev = value >= 90 ? "critical" : value >= 75 ? "warning" : "ok";
  const sevText = sev === "critical" ? "▲ high" : sev === "warning" ? "▲ elevated" : "● normal";
  return (
    <div className="meter-wrap">
      <div className="meter-head">
        <span>{label}</span>
        <span>
          <strong>{value.toFixed(0)}%</strong> <span className={`small sev-${sev}`}>{sevText}</span>
        </span>
      </div>
      <div className={`meter meter-${sev}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <span style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      {detail && <div className="muted small">{detail}</div>}
    </div>
  );
}

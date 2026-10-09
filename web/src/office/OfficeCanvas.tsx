import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Office, PrayerStatus, Worker } from "../api/types";
import { onPropsReady } from "./propAtlas";
import { planProgress, RAKAAT, type PrayerName, type SholatPlan } from "./sholat";
import { roleLabel } from "../store";
import { getAgentStyle, onAtlasReady, setAgentStyle, subscribeAgentStyle, variantFor, type AgentStyle } from "./characters";
import { drawFrame, type Hit, type LiveExtras } from "./render";
import { Sim } from "./sim";
import { buildWorld, roomsOf, worldWidth, type World } from "./world";

export interface StationRef {
  project: string | null;
  worker: Worker;
}

interface Props {
  office: Office;
  extras: LiveExtras;
  focusKey: string | null;
  onSelect: (s: StationRef) => void;
  onRegister: () => void;
  prayer: PrayerStatus | null;
  onInbox: (questionId?: string) => void;
  onTalk: () => void;
  /** project -> epoch ms: the PM brings a fresh report to the Owner until then */
  pmVisits?: Record<string, number>;
}

export { deskKey as stationKey } from "./world";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function useAgentStyle(): AgentStyle {
  return useSyncExternalStore(subscribeAgentStyle, getAgentStyle);
}

const STATE_TEXT: Record<string, string> = {
  working: "Working at desk",
  asking: "Waiting for your answer in the Owner's office",
  proposing: "Waiting for you to approve a delegation proposal",
  blocked: "Blocked",
  review: "Reviewing in the meeting room",
  waiting: "Waiting for work",
  idle: "Idle, wandering",
};

const HUD_H = 52; // css px reserved above the map for the HUD panels

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OfficeCanvas({ office, extras, focusKey, onSelect, onRegister, prayer, onInbox, onTalk, pmVisits }: Props) {
  const visitsRef = useRef(pmVisits ?? {});
  visitsRef.current = pmVisits ?? {};
  const [assets, setAssets] = useState(0);
  useEffect(() => onPropsReady(() => setAssets((n) => n + 1)), []);
  useEffect(() => onAtlasReady(() => setAssets((n) => n + 1)), []);
  const [preview, setPreview] = useState<SholatPlan | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const live: SholatPlan | null =
    prayer?.active && prayer.config.enabled
      ? { name: prayer.active.name as PrayerName, start: Date.parse(prayer.active.startedAt), end: Date.parse(prayer.active.endsAt) }
      : null;
  const plan = live ?? (preview && preview.end > nowTick ? preview : null);
  const talksRef = useRef(office.discussions ?? []);
  talksRef.current = office.discussions ?? [];
  const activeRef = useRef<string | null>(office.project);
  activeRef.current = office.project;
  const planRef = useRef(plan);
  planRef.current = plan;
  const [showTimes, setShowTimes] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520, dpr: window.devicePixelRatio || 1 });
  // zoom request: "fit" or an integer level (css px per native px); seq forces re-apply
  const [zoom, setZoomReq] = useState<{ level: "fit" | number; seq: number }>({ level: "fit", seq: 0 });
  const setZoom = (level: "fit" | number) => setZoomReq((z) => ({ level, seq: z.seq + 1 }));
  const [label, setLabel] = useState("1X");
  const [tip, setTip] = useState<{ x: number; y: number; key: string } | null>(null);
  const reduced = usePrefersReducedMotion();
  const style = useAgentStyle();
  const cam = useRef({ z: 1, ox: 0, oy: 0 });
  const hitsRef = useRef<Hit[]>([]);
  const hoverRef = useRef<string | null>(null);
  const regHoverRef = useRef(false);
  const extrasRef = useRef(extras);
  const focusRef = useRef(focusKey);
  const styleRef = useRef(style);
  extrasRef.current = extras;
  focusRef.current = focusKey;
  styleRef.current = style;
  const simRef = useRef<Sim>(new Sim());

  // ---- measure
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(320, Math.floor(el.clientWidth)), h: Math.max(420, Math.floor(window.innerHeight - r.top - 16)), dpr: window.devicePixelRatio || 1 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ---- world (rebuilt only when the floor plan changes)
  const cols = size.w >= worldWidth(3) + 16 ? 3 : 2;
  const sig = JSON.stringify([cols, roomsOf(office).rooms.map((r) => [r.project, r.name, r.active, r.kind, r.phase, (r.roles ?? []).join(","), r.workers.map((w) => w.role).sort()])]);
  const world: World = useMemo(() => buildWorld(office, cols), [sig, assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const worldRef = useRef(world);
  worldRef.current = world;
  useEffect(() => {
    simRef.current.setWorld(world);
  }, [world]);
  useEffect(() => {
    simRef.current.sync(office);
  }, [office]);

  // ---- camera
  const clampCam = (z: number, ox: number, oy: number) => {
    const cw = Math.round(size.w * size.dpr);
    const ch = Math.round(size.h * size.dpr);
    const ww = world.W * z;
    const wh = world.H * z;
    const top = Math.round(HUD_H * size.dpr);
    const m = Math.round(24 * size.dpr);
    ox = ww <= cw ? Math.round((cw - ww) / 2) : Math.min(m, Math.max(cw - ww - m, ox));
    oy = wh <= ch - top ? top + Math.round((ch - top - wh) / 2) : Math.min(top, Math.max(ch - wh - m, oy));
    return { z, ox: Math.round(ox), oy: Math.round(oy) };
  };
  const fitZ = Math.max(1, Math.floor((size.w * size.dpr) / world.W));
  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    const fit = zoom.level === "fit";
    const z = fit ? fitZ : Math.max(1, Math.round((zoom.level as number) * size.dpr));
    const prev = cam.current;
    // keep the centre of the view stable when zooming via buttons
    const cx = c.width / 2;
    const cy = c.height / 2;
    const wx = (cx - prev.ox) / prev.z;
    const wy = (cy - prev.oy) / prev.z;
    cam.current = clampCam(z, fit ? 0 : cx - wx * z, fit ? 1e9 : cy - wy * z);
    setLabel(`${fit ? Math.max(1, Math.round(fitZ / size.dpr)) : zoom.level}X`);
  }, [size, world, zoom, fitZ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let timer = 0;
    const frame = (now: number) => {
      const c = canvasRef.current;
      const w = worldRef.current;
      if (!c || !w) return;
      const dt = Math.min(100, now - last);
      last = now;
      const sim = simRef.current;
      sim.isFemale = (a) => variantFor(a.project, a.worker.role, styleRef.current) === "female";
      sim.activeProject = activeRef.current;
      sim.setDiscussions(talksRef.current, activeRef.current);
      sim.visits = visitsRef.current;
      sim.setPlan(planRef.current, Date.now());
      sim.update(dt, now, reduced);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const { z, ox, oy } = cam.current;
      ctx.setTransform(z, 0, 0, z, ox, oy);
      ctx.imageSmoothingEnabled = false;
      hitsRef.current = drawFrame(ctx, w, simRef.current, extrasRef.current, {
        t: now,
        reduced,
        hover: hoverRef.current,
        focus: focusRef.current,
        registerHover: regHoverRef.current,
        style: styleRef.current,
      });
    };
    const loop = (now: number) => {
      frame(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      if (document.hidden) return;
      if (reduced) {
        frame(performance.now());
        timer = window.setInterval(() => frame(performance.now()), 500);
      } else raf = requestAnimationFrame(loop);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, [reduced]);

  // ---- pointer
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const toWorld = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const { z, ox, oy } = cam.current;
    return { x: ((clientX - r.left) * k - ox) / z, y: ((clientY - r.top) * k - oy) / z, k };
  };
  const pick = (x: number, y: number) => {
    const hs = hitsRef.current;
    for (let i = hs.length - 1; i >= 0; i--) {
      const h = hs[i];
      if (x >= h.x - 2 && x < h.x + h.w + 2 && y >= h.y - 2 && y < h.y + h.h + 2) return h;
    }
    return null;
  };
  const inRegister = (x: number, y: number) => {
    const r = world.register;
    return !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: cam.current.ox, oy: cam.current.oy, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved) {
        cam.current = clampCam(cam.current.z, d.ox + dx * size.dpr, d.oy + dy * size.dpr);
        setTip(null);
        return;
      }
    }
    const p = toWorld(e.clientX, e.clientY);
    const h = pick(p.x, p.y);
    hoverRef.current = h?.key ?? null;
    regHoverRef.current = !h && inRegister(p.x, p.y);
    canvasRef.current!.style.cursor = d?.moved ? "grabbing" : h || regHoverRef.current ? "pointer" : "grab";
    if (h) {
      const { z, ox, oy } = cam.current;
      setTip({ x: ((h.x + h.w / 2) * z + ox) / p.k, y: (h.y * z + oy) / p.k, key: h.key });
    } else setTip(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return;
    const p = toWorld(e.clientX, e.clientY);
    const h = pick(p.x, p.y);
    if (h?.key === "__owner") onInbox();
    else if (h) {
      const a = simRef.current.actors.get(h.key);
      if (a?.worker.state === "asking") onInbox(a.worker.questionId ?? undefined);
      else if (a?.worker.state === "proposing") onInbox("dlg");
      else if (a) onSelect({ project: a.project, worker: a.worker });
    } else if (inRegister(p.x, p.y)) onRegister();
  };
  // wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dpr = window.devicePixelRatio || 1;
      const cur = Math.max(1, Math.round(cam.current.z / dpr));
      const next = Math.max(1, Math.min(4, cur + (e.deltaY < 0 ? 1 : -1)));
      if (next === cur) return;
      const r = c.getBoundingClientRect();
      const k = c.width / r.width;
      const mx = (e.clientX - r.left) * k;
      const my = (e.clientY - r.top) * k;
      const { z, ox, oy } = cam.current;
      const wx = (mx - ox) / z;
      const wy = (my - oy) / z;
      const nz = Math.max(1, Math.round(next * dpr));
      cam.current = clampCam(nz, mx - wx * nz, my - wy * nz);
      setLabel(`${next}X`);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });
  const curLevel = Number(label.replace("X", "")) || 1;
  const step = (d: number) => setZoom(Math.max(1, Math.min(4, Math.round(cam.current.z / size.dpr) + d)));

  const tipActor = tip && tip.key !== "__owner" ? simRef.current.actors.get(tip.key) : null;
  const { rooms, hq } = roomsOf(office);
  const summary = hq
    ? `Headquarters with ${office.hq.length} workers. No projects registered yet.`
    : rooms.map((r) => `${r.name}${r.active ? " (active)" : ""}: ${r.workers.map((w) => `${roleLabel(w.role)} ${w.state}`).join(", ")}`).join(". ");
  const tokens = extras.todayTokens;
  const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n));

  return (
    <div ref={wrapRef} className="office-wrap v2">
      <div className="office-stage" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          className="office-canvas"
          style={{ width: size.w, height: size.h }}
          role="img"
          aria-label={`Pixel-art office map. ${summary}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            hoverRef.current = null;
            regHoverRef.current = false;
            setTip(null);
          }}
        />
        <div className="hud" aria-label="Office stats">
          <HudPanel icon="coin" label="Tokens today" value={tokens === null ? "—" : fmt(tokens)} />
          <HudPanel icon="cash" label="API-eq. today" value={extras.todayCost === null ? "—" : `$${extras.todayCost.toFixed(2)}`} />
          <HudPanel icon="cpu" label="CPU" value={extras.cpu === null ? "—" : `${Math.round(extras.cpu)}%`} warn={(extras.cpu ?? 0) >= 85} />
          <HudPanel icon="live" label="Live sessions" value={String(extras.interactive)} />
          <SholatPanel prayer={prayer} plan={plan} now={nowTick} />
        </div>
        <div className="hud-tools">
          <div className="px-pop">
            <button className="px-btn wide" onClick={() => setShowTimes((v) => !v)} aria-expanded={showTimes} aria-label="Today's prayer times">
              JADWAL
            </button>
            {showTimes && prayer && (
              <div className="px-popover" role="dialog" aria-label="Jadwal sholat hari ini">
                <div className="px-pop-title">
                  {prayer.config.city} · {prayer.date}
                </div>
                <ul>
                  {prayer.times.slice(0, 1).map((p) => (
                    <li key={p.name} className={prayer.next?.name === p.name ? "next" : ""}>
                      <span>{cap(p.name)}</span>
                      <span>{p.hhmm}</span>
                    </li>
                  ))}
                  <li className="muted-row">
                    <span>Terbit</span>
                    <span>{prayer.sunrise}</span>
                  </li>
                  {prayer.times.slice(1).map((p) => (
                    <li key={p.name} className={prayer.next?.name === p.name ? "next" : ""}>
                      <span>{cap(p.name)}</span>
                      <span>{p.hhmm}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-pop-foot">Kemenag · window {prayer.config.windowMin} min</div>
              </div>
            )}
          </div>
          <button className="px-btn wide" onClick={onTalk}>
            TALK TO ANALYST
          </button>
          <button
            className="px-btn wide"
            onClick={() =>
              setPreview((p) =>
                p && p.end > Date.now()
                  ? null
                  : {
                      name: (prayer?.next?.name as PrayerName) ?? "dzuhur",
                      start: Date.now(),
                      end: Date.now() + (prayer?.config.windowMin ?? 20) * 60_000,
                      preview: true,
                    },
              )
            }
            disabled={!!live}
            aria-pressed={!!preview && !live}
          >
            {preview && !live && preview.end > nowTick ? "STOP PREVIEW" : "PREVIEW SHOLAT"}
          </button>
          <label className="px-select">
            <span>Agents</span>
            <select value={style} onChange={(e) => setAgentStyle(e.target.value as AgentStyle)} aria-label="Agent sprite style">
              <option value="mixed">Mixed</option>
              <option value="female">All female</option>
              <option value="male">All male</option>
            </select>
          </label>
        </div>
        <div className="zoom-tools" role="group" aria-label="Zoom">
          <button className="px-btn" onClick={() => step(1)} aria-label="Zoom in" disabled={curLevel >= 4}>
            +
          </button>
          <span className="px-zoom" aria-live="polite">
            {label}
          </span>
          <button className="px-btn" onClick={() => step(-1)} aria-label="Zoom out" disabled={curLevel <= 1}>
            −
          </button>
          <button
            className="px-btn wide"
            onClick={() => setZoom("fit")}
            aria-label="Fit to width"
          >
            FIT
          </button>
        </div>
        {tip && tipActor && (
          <div className="office-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
            <strong>{roleLabel(tipActor.worker.role)}</strong>
            <span className={`state-pill state-${tipActor.worker.state}`}>{STATE_TEXT[tipActor.worker.state] ?? tipActor.worker.state}</span>
            <span className="muted">
              {tipActor.worker.role === "analyst" && office.analyst ? "Owner's office · for " : ""}
              {tipActor.project ? (office.rooms.find((r) => r.project === tipActor.project)?.name ?? tipActor.project) : tipActor.worker.role === "analyst" ? "the workspace" : "HQ"}
            </span>
            {tipActor.worker.taskId && (
              <span className="tip-task">
                {tipActor.worker.taskId}
                {tipActor.worker.taskTitle ? ` · ${tipActor.worker.taskTitle}` : ""}
              </span>
            )}
            {tipActor.worker.queued > 0 && <span className="muted">{tipActor.worker.queued} ready in queue</span>}
            {tipActor.worker.state === "asking" && tipActor.worker.question && <span className="tip-task">“{tipActor.worker.question}” · click to answer</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function countdown(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`;
}

function SholatPanel({ prayer, plan, now }: { prayer: PrayerStatus | null; plan: SholatPlan | null; now: number }) {
  if (plan) {
    const p = planProgress(plan, now);
    return (
      <div className="hud-panel sholat on">
        <HudIcon kind="mosque" />
        <span className="hud-text">
          <span className="hud-label">Sholat{plan.preview ? " (preview)" : ""}</span>
          <span className="hud-value">
            {plan.name.toUpperCase()} — berjamaah <span className="hud-sub">{RAKAAT[plan.name]} rakaat</span>
          </span>
          <span className="hud-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Sholat window progress">
            <span style={{ width: `${p * 100}%` }} />
          </span>
        </span>
      </div>
    );
  }
  const next = prayer?.next;
  return (
    <div className="hud-panel sholat">
      <HudIcon kind="mosque" />
      <span className="hud-text">
        <span className="hud-label">Sholat</span>
        <span className="hud-value">{next ? `${next.name.toUpperCase()} ${next.hhmm} · ${countdown(Date.parse(next.at) - now)}` : "—"}</span>
      </span>
    </div>
  );
}

function HudPanel({ icon, label, value, warn }: { icon: "coin" | "cash" | "cpu" | "live"; label: string; value: string; warn?: boolean }) {
  return (
    <div className={`hud-panel${warn ? " warn" : ""}`}>
      <HudIcon kind={icon} />
      <span className="hud-text">
        <span className="hud-label">{label}</span>
        <span className="hud-value">{value}</span>
      </span>
    </div>
  );
}

const ICONS: Record<string, [string, string][]> = {
  // 8x8 pixel icons: [rows, colour]
  coin: [
    ["..####..", "#f4c430"],
    [".######.", "#f4c430"],
    ["##.##.##", "#f4c430"],
    ["########", "#f4c430"],
    ["##.##.##", "#f4c430"],
    ["########", "#f4c430"],
    [".######.", "#c99a12"],
    ["..####..", "#c99a12"],
  ],
  cash: [
    ["........", ""],
    ["########", "#3fae5a"],
    ["#..##..#", "#3fae5a"],
    ["#.#..#.#", "#3fae5a"],
    ["#.#..#.#", "#3fae5a"],
    ["#..##..#", "#3fae5a"],
    ["########", "#2d7f42"],
    ["........", ""],
  ],
  cpu: [
    [".#.#.#..", "#7a8396"],
    ["#######.", "#3d4357"],
    ["#.###.##", "#3d4357"],
    ["#.#.#.#.", "#5ab8ff"],
    ["#.###.##", "#3d4357"],
    ["#######.", "#3d4357"],
    [".#.#.#..", "#7a8396"],
    ["........", ""],
  ],
  mosque: [
    ["...#....", "#2f8a5b"],
    ["..###...", "#2f8a5b"],
    [".#####..", "#2f8a5b"],
    ["#######.", "#3fae6a"],
    ["#.###.#.", "#efe9c4"],
    ["#.#.#.#.", "#efe9c4"],
    ["#######.", "#b9a77a"],
    ["........", ""],
  ],
  live: [
    ["........", ""],
    ["#######.", "#3d4357"],
    ["#.....#.", "#3d4357"],
    ["#.###.#.", "#8ff0ff"],
    ["#.....#.", "#3d4357"],
    ["#######.", "#3d4357"],
    ["..###...", "#7a8396"],
    [".#####..", "#7a8396"],
  ],
};
function HudIcon({ kind }: { kind: string }) {
  const rows = ICONS[kind];
  return (
    <svg className="hud-icon" viewBox="0 0 8 8" width="24" height="24" shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap(([r, c], y) => [...r].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c} /> : null)))}
    </svg>
  );
}

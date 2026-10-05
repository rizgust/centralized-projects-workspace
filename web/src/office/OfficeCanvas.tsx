import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Office, Worker } from "../api/types";
import { computeLayout, drawBackground, drawFrame, hitTest, roomsOf, type Layout, type LiveExtras, type Station } from "./scene";
import { roleLabel } from "../store";

export interface StationRef {
  project: string | null;
  worker: Worker;
}

interface Props {
  office: Office;
  types: Record<string, string>;
  extras: LiveExtras;
  focusKey: string | null;
  onSelect: (s: StationRef) => void;
  onRegister: () => void;
}

export const stationKey = (project: string | null, role: string) => `${project ?? "hq"}/${role}`;

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

const STATE_TEXT: Record<string, string> = {
  working: "Working",
  blocked: "Blocked",
  review: "In review",
  waiting: "Waiting for work",
  idle: "Idle",
};

export function OfficeCanvas({ office, types, extras, focusKey, onSelect, onRegister }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const bgRef = useRef<{ sig: string; canvas: HTMLCanvasElement } | null>(null);
  const extrasRef = useRef(extras);
  const hoverRef = useRef<Station | null>(null);
  const regHoverRef = useRef(false);
  const scaleRef = useRef(1);
  const focusRef = useRef<string | null>(focusKey);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [avail, setAvail] = useState({ w: 1000, h: 600, dpr: window.devicePixelRatio || 1 });
  const [tip, setTip] = useState<{ x: number; y: number; s: Station } | null>(null);
  const reduced = usePrefersReducedMotion();

  extrasRef.current = extras;
  focusRef.current = focusKey;

  // Measure available space.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.max(300, window.innerHeight - rect.top - 120);
      setAvail({ w: el.clientWidth, h, dpr: window.devicePixelRatio || 1 });
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

  // Pick columns + integer device-pixel scale.
  useLayoutEffect(() => {
    const n = roomsOf(office).rooms.length;
    const pick = (hFactor: number) => {
      let best: { L: Layout; s: number } | null = null;
      for (let cols = 1; cols <= Math.min(n, 4); cols++) {
        const L = computeLayout(office, cols, types);
        const s = Math.floor(Math.min((avail.w * avail.dpr) / L.W, (avail.h * hFactor * avail.dpr) / L.H));
        if (!best || s > best.s || (s === best.s && L.H < best.L.H)) best = { L, s };
      }
      return best!;
    };
    let best = pick(1);
    if (best.s < 2 * avail.dpr) {
      const relaxed = pick(2.2);
      if (relaxed.s > best.s) best = relaxed;
    }
    const s = Math.max(1, Math.min(best.s, Math.floor(6 * avail.dpr)));
    layoutRef.current = best.L;
    scaleRef.current = s;
    const c = canvasRef.current;
    if (c) {
      c.width = best.L.W * s;
      c.height = best.L.H * s;
    }
    setSize({ w: (best.L.W * s) / avail.dpr, h: (best.L.H * s) / avail.dpr });
    if (hoverRef.current) {
      // re-resolve hover against the new layout
      hoverRef.current = null;
      setTip(null);
    }
  }, [office, types, avail]);

  const draw = useCallback((t: number) => {
    const c = canvasRef.current;
    const L = layoutRef.current;
    if (!c || !L) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (!bgRef.current || bgRef.current.sig !== L.signature) {
      const bg = bgRef.current?.canvas ?? document.createElement("canvas");
      bg.width = L.W;
      bg.height = L.H;
      const bctx = bg.getContext("2d")!;
      bctx.imageSmoothingEnabled = false;
      bctx.clearRect(0, 0, L.W, L.H);
      drawBackground(bctx, L);
      bgRef.current = { sig: L.signature, canvas: bg };
    }
    const s = scaleRef.current;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    let focus: Station | null = null;
    if (focusRef.current) {
      for (const R of L.rooms) for (const st of R.stations) if (stationKey(st.project, st.worker.role) === focusRef.current) focus = st;
    }
    drawFrame(ctx, bgRef.current.canvas, L, extrasRef.current, { t, hover: hoverRef.current, focus, registerHover: regHoverRef.current });
  }, []);

  // Animation loop (paused when hidden; static when reduced motion).
  useEffect(() => {
    if (reduced) {
      draw(0);
      return;
    }
    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", start);
    };
  }, [draw, reduced]);

  // In reduced-motion mode redraw on data/hover changes.
  useEffect(() => {
    if (reduced) draw(0);
  }, [reduced, draw, office, extras, size, focusKey, tip]);

  // Keep the station objects fresh after office updates (hover/tooltip).
  useEffect(() => {
    const L = layoutRef.current;
    if (!L || !tip) return;
    for (const R of L.rooms)
      for (const st of R.stations)
        if (st.project === tip.s.project && st.worker.role === tip.s.worker.role) {
          hoverRef.current = st;
          if (st !== tip.s) setTip({ ...tip, s: st });
        }
  }, [office, tip]);

  const toWorld = (e: React.PointerEvent | React.MouseEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width / scaleRef.current;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k };
  };

  const onMove = (e: React.PointerEvent) => {
    const L = layoutRef.current;
    if (!L) return;
    const { x, y, k } = toWorld(e);
    const hit = hitTest(L, x, y);
    regHoverRef.current = hit.register;
    hoverRef.current = hit.station;
    const c = canvasRef.current!;
    c.style.cursor = hit.station || hit.register ? "pointer" : "default";
    if (hit.station) {
      const st = hit.station;
      setTip({ x: (st.x + 24) / k, y: (st.y - 8) / k, s: st });
    } else setTip(null);
  };

  const onClick = (e: React.MouseEvent) => {
    const L = layoutRef.current;
    if (!L) return;
    const { x, y } = toWorld(e);
    const hit = hitTest(L, x, y);
    if (hit.register) onRegister();
    else if (hit.station) onSelect({ project: hit.station.project, worker: hit.station.worker });
  };

  const { rooms, hq } = roomsOf(office);
  const summary = hq
    ? `Headquarters with ${office.hq.length} workers. No projects registered yet.`
    : rooms.map((r) => `${r.name}${r.active ? " (active)" : ""}: ${r.workers.map((w) => `${roleLabel(w.role)} ${w.state}`).join(", ")}`).join(". ");

  return (
    <div ref={wrapRef} className="office-wrap">
      <div className="office-stage" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          className="office-canvas"
          style={{ width: size.w, height: size.h }}
          role="img"
          aria-label={`Pixel-art office. ${summary}`}
          onPointerMove={onMove}
          onPointerLeave={() => {
            hoverRef.current = null;
            regHoverRef.current = false;
            setTip(null);
          }}
          onClick={onClick}
        />
        {tip && (
          <div className="office-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
            <strong>{roleLabel(tip.s.worker.role)}</strong>
            <span className={`state-pill state-${tip.s.worker.state}`}>{STATE_TEXT[tip.s.worker.state] ?? tip.s.worker.state}</span>
            {tip.s.worker.taskId && (
              <span className="tip-task">
                {tip.s.worker.taskId}
                {tip.s.worker.taskTitle ? ` · ${tip.s.worker.taskTitle}` : ""}
              </span>
            )}
            {tip.s.worker.queued > 0 && <span className="muted">{tip.s.worker.queued} ready in queue</span>}
          </div>
        )}
      </div>
    </div>
  );
}

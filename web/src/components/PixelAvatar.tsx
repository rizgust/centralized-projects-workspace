import { useEffect, useRef } from "react";
import type { Role } from "../api/types";
import { drawWorker } from "../office/pixel";
import { roleLabel } from "../store";

const LW = 14;
const LH = 14;

/** Front-facing pixel bust of a role, crisp at any DPR. `size` is the CSS pixel scale. */
export function PixelAvatar({ role, scale = 2, title }: { role: Role | string; scale?: number; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.round(scale * dpr));
    c.width = LW * s;
    c.height = LH * s;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    drawWorker(ctx, role as Role, "front", 1, 2, { rows: 12 });
  }, [role, scale]);
  const label = title ?? roleLabel(role);
  const dpr = window.devicePixelRatio || 1;
  const dev = Math.max(1, Math.round(scale * dpr));
  return (
    <canvas
      ref={ref}
      className="pixel-avatar"
      style={{ width: (LW * dev) / dpr, height: (LH * dev) / dpr }}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

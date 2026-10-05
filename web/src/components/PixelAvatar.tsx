import { useEffect, useRef, useState } from "react";
import type { Role } from "../api/types";
import { drawPortrait, onAtlasReady, variantFor } from "../office/characters";
import { useAgentStyle } from "../office/OfficeCanvas";
import { roleLabel } from "../store";

const LW = 16;
const LH = 16;

/**
 * Pixel portrait of a role agent, using the same sprite variant as that worker in the office
 * (`project` gives the context; without it the role id alone decides, like HQ).
 */
export function PixelAvatar({ role, scale = 2, title, project }: { role: Role | string; scale?: number; title?: string; project?: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const style = useAgentStyle();
  const [, setReady] = useState(0);
  useEffect(() => onAtlasReady(() => setReady((n) => n + 1)), []);
  const dpr = window.devicePixelRatio || 1;
  const dev = Math.max(1, Math.round(scale * dpr));
  const variant = variantFor(project ?? null, role, style);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = LW * dev;
    c.height = LH * dev;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawPortrait(ctx, role, variant, c.width, c.height);
  });
  const label = title ?? roleLabel(role);
  return <canvas ref={ref} className="pixel-avatar" style={{ width: (LW * dev) / dpr, height: (LH * dev) / dpr }} role="img" aria-label={label} title={label} />;
}
